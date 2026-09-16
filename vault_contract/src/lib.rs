#![no_std]

//! Vault comunitario (Modulo 2): las donaciones de un pool se custodian
//! en este contrato y el owner las retira cuando quiere, al momento.
//!
//! Reglas enforced ON-CHAIN (no a nivel app):
//! - Un pool con la meta cumplida (equivalente en XLM >= goal) rechaza
//!   donaciones nuevas.
//! - El owner de un pool no puede donarle a su propio vault.
//! - Solo el owner puede retirar fondos del pool.
//! - Solo se aceptan los assets registrados en el constructor, cada uno
//!   con su tasa referencial a XLM (XLM = 1, USDC = 10, EURC = 11).
//!
//! Los pools se identifican por el short_code del pool (String, 10 chars).
//! `initial_equivalent` permite registrar pools migrados conservando el
//! progreso historico de donaciones que ya llegaron directo a la wallet.
//!
//! Nota de rent: el storage de Soroban se paga con el balance XLM del
//! propio contrato. Si el owner retira TODO el XLM, las entradas pueden
//! archivarse por inactividad; conviene dejar un pequeno buffer.

use soroban_sdk::{contract, contractimpl, contracttype, token::TokenClient, Address, Env, Map, String, Vec};

#[cfg(test)]
mod test;

#[contracttype]
pub struct Pool {
    pub owner: Address,
    /// Meta en XLM-equivalente. 0 = sin meta (nunca se completa).
    pub goal: i128,
    /// Progreso historico migrado (donaciones previas a la wallet), ya
    /// contado como XLM-equivalente.
    pub initial_equivalent: i128,
    /// Acumulado donado por asset (Address del SAC). Nunca baja al retirar:
    /// la meta cuenta lo donado, no el balance actual.
    pub donated: Map<Address, i128>,
    /// Acumulado retirado por asset. El balance del contrato es GLOBAL
    /// (compartido por todos los pools), asi que sin este cap un owner
    /// podria retirar lo donado a OTRO pool: el retiro se limita a lo
    /// donado a este pool en particular.
    pub withdrawn: Map<Address, i128>,
}

#[contracttype]
pub struct AssetInfo {
    pub asset: Address,
    pub donated: i128,
    pub withdrawn: i128,
    /// Lo que este pool puede retirar todavia del asset: donado - retirado.
    pub available: i128,
}

#[contracttype]
pub struct PoolInfo {
    pub owner: Address,
    pub goal: i128,
    pub initial_equivalent: i128,
    pub equivalent_total: i128,
    pub complete: bool,
    pub assets: Vec<AssetInfo>,
}

#[contracttype]
pub enum DataKey {
    /// Map<Address del SAC, i128>: tasa referencial a XLM. Estar en el
    /// mapa = asset permitido.
    Rates,
    /// Map<short_code, Pool>
    Pools,
}

/// TTL de storage: mientras el contrato se use, se renueva.
const INSTANCE_TTL: u32 = 1000;

#[contract]
pub struct CommunityVault;

#[contractimpl]
impl CommunityVault {
    /// Se llama una sola vez al deployar, con los assets permitidos y sus
    /// tasas referenciales a XLM (paralelos, mismo largo).
    pub fn constructor(env: Env, assets: Vec<Address>, rates: Vec<i128>) {
        if env.storage().instance().has(&DataKey::Rates) {
            panic!("el vault ya fue inicializado");
        }
        if assets.len() != rates.len() {
            panic!("assets y rates tienen que tener el mismo largo");
        }
        let mut map = Map::new(&env);
        for (asset, rate) in assets.iter().zip(rates.iter()) {
            if rate <= 0 {
                panic!("la tasa referencial tiene que ser mayor a 0");
            }
            map.set(asset.clone(), rate);
        }
        env.storage().instance().set(&DataKey::Rates, &map);
    }

    /// Registra un pool (nuevo o migrado). Lo firma el owner del pool.
    pub fn create_pool(
        env: Env,
        short_code: String,
        owner: Address,
        goal: i128,
        initial_equivalent: i128,
    ) {
        owner.require_auth();
        if goal < 0 || initial_equivalent < 0 {
            panic!("goal e initial_equivalent no pueden ser negativos");
        }
        let mut pools: Map<String, Pool> = env
            .storage()
            .instance()
            .get(&DataKey::Pools)
            .unwrap_or_else(|| Map::new(&env));
        if pools.contains_key(short_code.clone()) {
            panic!("ya existe un pool con ese short_code");
        }
        pools.set(
            short_code.clone(),
            Pool {
                owner: owner.clone(),
                goal,
                initial_equivalent,
                donated: Map::new(&env),
                withdrawn: Map::new(&env),
            },
        );
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        env.storage().instance().set(&DataKey::Pools, &pools);
    }

    /// El donante firma y transfiere sus tokens al vault. Rechazos reales
    /// on-chain: meta cumplida, auto-donacion del owner, asset no admitido.
    pub fn deposit(env: Env, short_code: String, donor: Address, asset: Address, amount: i128) {
        if amount <= 0 {
            panic!("el monto tiene que ser mayor a 0");
        }
        donor.require_auth();
        let _rate = rate_for(&env, &asset);

        let mut pool = get_pool(&env, &short_code);
        if pool.owner == donor {
            panic!("el owner de este pool no puede donarle a su propio vault");
        }
        if pool.goal > 0 && equivalent_of(&env, &pool) >= pool.goal {
            panic!("la meta ya esta cumplida: este pool ya no recibe donaciones");
        }

        let vault = env.current_contract_address();
        TokenClient::new(&env, &asset).transfer(&donor, &vault, &amount);

        let donated = pool.donated.get(asset.clone()).unwrap_or(0) + amount;
        pool.donated.set(asset.clone(), donated);
        let mut pools: Map<String, Pool> = env
            .storage()
            .instance()
            .get(&DataKey::Pools)
            .unwrap_or_else(|| Map::new(&env));
        pools.set(short_code.clone(), pool);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        env.storage().instance().set(&DataKey::Pools, &pools);
    }

    /// El owner firma y retira fondos del vault hacia `to`, al momento.
    /// Sin limite de monto ni de frecuencia, PERO acotado a lo donado a
    /// ESTE pool por asset: el balance global del contrato es compartido
    /// entre pools, el cap por pool evita retirar lo donado a otro.
    pub fn withdraw(
        env: Env,
        short_code: String,
        owner: Address,
        asset: Address,
        to: Address,
        amount: i128,
    ) {
        if amount <= 0 {
            panic!("el monto tiene que ser mayor a 0");
        }
        owner.require_auth();
        let _rate = rate_for(&env, &asset);

        let mut pool = get_pool(&env, &short_code);
        if pool.owner != owner {
            panic!("solo el owner de este pool puede retirar fondos");
        }

        let donated = pool.donated.get(asset.clone()).unwrap_or(0);
        let already_withdrawn = pool.withdrawn.get(asset.clone()).unwrap_or(0);
        if already_withdrawn + amount > donated {
            panic!("el retiro supera lo donado a este pool para ese asset");
        }

        let vault = env.current_contract_address();
        TokenClient::new(&env, &asset).transfer(&vault, &to, &amount);

        pool.withdrawn
            .set(asset.clone(), already_withdrawn + amount);
        let mut pools: Map<String, Pool> = env
            .storage()
            .instance()
            .get(&DataKey::Pools)
            .unwrap_or_else(|| Map::new(&env));
        pools.set(short_code.clone(), pool);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        env.storage().instance().set(&DataKey::Pools, &pools);
    }

    /// Estado del pool leido directo del ledger (fuente de verdad). Los
    /// montos por asset estan acotados a este pool (donado / retirado /
    /// disponible), no al balance global del contrato.
    pub fn pool_info(env: Env, short_code: String) -> PoolInfo {
        let pool = get_pool(&env, &short_code);
        let rates: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&DataKey::Rates)
            .unwrap_or_else(|| Map::new(&env));

        let mut assets: Vec<AssetInfo> = Vec::new(&env);
        let mut equivalent = pool.initial_equivalent;
        for (asset, donated) in pool.donated.iter() {
            let rate = rates.get(asset.clone()).unwrap_or(0);
            equivalent += donated * rate;
            let withdrawn = pool.withdrawn.get(asset.clone()).unwrap_or(0);
            assets.push_back(AssetInfo {
                asset,
                donated,
                withdrawn,
                available: donated - withdrawn,
            });
        }
        let complete = pool.goal > 0 && equivalent >= pool.goal;

        PoolInfo {
            owner: pool.owner,
            goal: pool.goal,
            initial_equivalent: pool.initial_equivalent,
            equivalent_total: equivalent,
            complete,
            assets,
        }
    }
}

fn rate_for(env: &Env, asset: &Address) -> i128 {
    let rates: Map<Address, i128> = env
        .storage()
        .instance()
        .get(&DataKey::Rates)
        .unwrap_or_else(|| panic!("el vault no fue inicializado"));
    rates
        .get(asset.clone())
        .unwrap_or_else(|| panic!("asset no admitido en este vault"))
}

fn get_pool(env: &Env, short_code: &String) -> Pool {
    let pools: Map<String, Pool> = env
        .storage()
        .instance()
        .get(&DataKey::Pools)
        .unwrap_or_else(|| Map::new(env));
    pools
        .get(short_code.clone())
        .unwrap_or_else(|| panic!("no existe un pool con ese short_code"))
}

fn equivalent_of(env: &Env, pool: &Pool) -> i128 {
    let rates: Map<Address, i128> = env
        .storage()
        .instance()
        .get(&DataKey::Rates)
        .unwrap_or_else(|| Map::new(env));
    let mut equivalent = pool.initial_equivalent;
    for (asset, donated) in pool.donated.iter() {
        equivalent += donated * rates.get(asset.clone()).unwrap_or(0);
    }
    equivalent
}
