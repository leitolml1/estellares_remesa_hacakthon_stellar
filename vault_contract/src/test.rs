#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, Address, Env, String, Vec,
};

fn register_token(env: &Env) -> Address {
    let admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(admin)
        .address()
}

struct Setup<'a> {
    vault: Address,
    xlm_like: Address,
    usdc_like: Address,
    client: CommunityVaultClient<'a>,
}

fn setup_vault(env: &Env) -> Setup<'_> {
    let xlm_like = register_token(env);
    let usdc_like = register_token(env);
    let vault = env.register_contract(None, CommunityVault);
    let client = CommunityVaultClient::new(env, &vault);

    let mut assets = Vec::new(env);
    assets.push_back(xlm_like.clone());
    assets.push_back(usdc_like.clone());
    let mut rates = Vec::new(env);
    rates.push_back(1i128);
    rates.push_back(10i128);
    client.mock_all_auths().constructor(&assets, &rates);
    Setup {
        vault,
        xlm_like,
        usdc_like,
        client,
    }
}

fn short_code(env: &Env) -> String {
    String::from_str(env, "zgUtnYqU1O")
}

#[test]
fn create_pool_y_deposit_xlm_suman_equivalente() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    StellarAssetClient::new(&env, &s.xlm_like)
        .mock_all_auths()
        .mint(&donor, &2_000_000_000i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);
    s.client
        .mock_all_auths()
        .deposit(&code, &donor, &s.xlm_like, &2_000_000_000i128);

    let info = s.client.pool_info(&code);
    assert_eq!(info.equivalent_total, 2_000_000_000i128);
    assert_eq!(info.complete, false);
    assert_eq!(info.assets.len(), 1);
    assert_eq!(info.assets.get(0).unwrap().donated, 2_000_000_000i128);
    assert_eq!(info.assets.get(0).unwrap().available, 2_000_000_000i128);
    assert_eq!(
        soroban_sdk::token::TokenClient::new(&env, &s.xlm_like).balance(&donor),
        0
    );
    assert_eq!(
        soroban_sdk::token::TokenClient::new(&env, &s.xlm_like).balance(&s.vault),
        2_000_000_000i128
    );
}

#[test]
fn deposit_usdc_usa_la_tasa_referencial() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    StellarAssetClient::new(&env, &s.usdc_like)
        .mock_all_auths()
        .mint(&donor, &5i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);
    s.client
        .mock_all_auths()
        .deposit(&code, &donor, &s.usdc_like, &5i128);

    let info = s.client.pool_info(&code);
    // 5 "USDC" * tasa 10 = 50 XLM-equivalentes.
    assert_eq!(info.equivalent_total, 50i128);
}

#[test]
fn el_owner_no_puede_auto_donarse() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    StellarAssetClient::new(&env, &s.xlm_like)
        .mock_all_auths()
        .mint(&owner, &100i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);

    s.client
        .mock_all_auths()
        .try_deposit(&code, &owner, &s.xlm_like, &10i128)
        .unwrap_err()
        .unwrap();
}

#[test]
fn pool_completo_rechaza_donaciones() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    StellarAssetClient::new(&env, &s.xlm_like)
        .mock_all_auths()
        .mint(&donor, &100i128);

    let code = short_code(&env);
    // Meta 10, equivalente inicial 10: nace completo (pool migrado).
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &10, &10);

    s.client
        .mock_all_auths()
        .try_deposit(&code, &donor, &s.xlm_like, &1i128)
        .unwrap_err()
        .unwrap();
}

#[test]
fn la_meta_se_completa_al_alcanzar_el_equivalente() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    StellarAssetClient::new(&env, &s.usdc_like)
        .mock_all_auths()
        .mint(&donor, &100i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &10, &0);
    // 2 USDC * 10 = 20 >= meta 10.
    s.client
        .mock_all_auths()
        .deposit(&code, &donor, &s.usdc_like, &2i128);

    let info = s.client.pool_info(&code);
    assert_eq!(info.complete, true);
    // Completo: la siguiente donacion se rechaza.
    s.client
        .mock_all_auths()
        .try_deposit(&code, &donor, &s.usdc_like, &1i128)
        .unwrap_err()
        .unwrap();
}

#[test]
fn solo_el_owner_retira_y_el_balance_baja() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    let outsider = Address::generate(&env);
    StellarAssetClient::new(&env, &s.xlm_like)
        .mock_all_auths()
        .mint(&donor, &100i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);
    s.client
        .mock_all_auths()
        .deposit(&code, &donor, &s.xlm_like, &100i128);

    // Un tercero no puede retirar.
    s.client
        .mock_all_auths()
        .try_withdraw(&code, &outsider, &s.xlm_like, &outsider, &10i128)
        .unwrap_err()
        .unwrap();

    // El owner retira al momento y el disponible baja.
    let token = soroban_sdk::token::TokenClient::new(&env, &s.xlm_like);
    assert_eq!(token.balance(&s.vault), 100i128);
    s.client
        .mock_all_auths()
        .withdraw(&code, &owner, &s.xlm_like, &outsider, &40i128);
    assert_eq!(token.balance(&s.vault), 60i128);
    assert_eq!(token.balance(&outsider), 40i128);

    // No puede retirar mas de lo donado a ESTE pool (el cap por pool evita
    // llevarse donaciones de otros pools que comparten el contrato).
    s.client
        .mock_all_auths()
        .try_withdraw(&code, &owner, &s.xlm_like, &outsider, &61i128)
        .unwrap_err()
        .unwrap();

    // Lo donado acumulado no baja al retirar: la meta cuenta donaciones.
    let info = s.client.pool_info(&code);
    assert_eq!(info.assets.get(0).unwrap().donated, 100i128);
    assert_eq!(info.assets.get(0).unwrap().withdrawn, 40i128);
    assert_eq!(info.assets.get(0).unwrap().available, 60i128);
    assert_eq!(info.equivalent_total, 100i128);
}

#[test]
fn asset_no_admitido_se_rechaza() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    let rogue = register_token(&env);
    StellarAssetClient::new(&env, &rogue)
        .mock_all_auths()
        .mint(&donor, &10i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);
    s.client
        .mock_all_auths()
        .try_deposit(&code, &donor, &rogue, &1i128)
        .unwrap_err()
        .unwrap();
}

#[test]
fn short_code_duplicado_y_pool_inexistente() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);
    s.client
        .mock_all_auths()
        .try_create_pool(&code, &owner, &0, &0)
        .unwrap_err()
        .unwrap();

    let otro = String::from_str(&env, "noExiste12");
    assert!(s.client.mock_all_auths().try_pool_info(&otro).is_err());
}

#[test]
fn constructor_no_se_puede_llamar_dos_veces() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let mut assets = Vec::new(&env);
    assets.push_back(Address::generate(&env));
    let mut rates = Vec::new(&env);
    rates.push_back(1i128);
    s.client
        .mock_all_auths()
        .try_constructor(&assets, &rates)
        .unwrap_err()
        .unwrap();
}

#[test]
fn el_owner_se_ve_en_pool_info() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);
    let owner = Address::generate(&env);
    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &123, &45);
    let info = s.client.pool_info(&code);
    assert_eq!(info.owner, owner);
    assert_eq!(info.goal, 123i128);
    assert_eq!(info.initial_equivalent, 45i128);
    assert_eq!(info.equivalent_total, 45i128);
}

#[test]
fn el_leaderboard_ordena_por_equivalente_desc() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donante_chico = Address::generate(&env);
    let donante_grande = Address::generate(&env);
    StellarAssetClient::new(&env, &s.xlm_like)
        .mock_all_auths()
        .mint(&donante_chico, &1_000_000_000i128);
    StellarAssetClient::new(&env, &s.usdc_like)
        .mock_all_auths()
        .mint(&donante_chico, &1_000i128);
    StellarAssetClient::new(&env, &s.usdc_like)
        .mock_all_auths()
        .mint(&donante_grande, &1_000i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);

    // donante_chico: 100 unidades XLM (equiv 100) + 2 USDC (equiv 20) = 120.
    s.client
        .mock_all_auths()
        .deposit(&code, &donante_chico, &s.xlm_like, &100i128);
    s.client
        .mock_all_auths()
        .deposit(&code, &donante_chico, &s.usdc_like, &2i128);
    // donante_grande: 50 USDC * tasa 10 = 500 XLM-equivalente.
    s.client
        .mock_all_auths()
        .deposit(&code, &donante_grande, &s.usdc_like, &50i128);

    let donors = s.client.donors(&code);
    assert_eq!(donors.len(), 2);
    assert_eq!(donors.get(0).unwrap().0, donante_grande);
    assert_eq!(donors.get(0).unwrap().1, 500i128);
    assert_eq!(donors.get(1).unwrap().0, donante_chico);
    // 100 (XLM) + 20 (2 USDC) = 120, aportes suman aunque sean en assets
    // distintos.
    assert_eq!(donors.get(1).unwrap().1, 120i128);
}

#[test]
fn retirar_no_baja_el_leaderboard() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    let outsider = Address::generate(&env);
    StellarAssetClient::new(&env, &s.xlm_like)
        .mock_all_auths()
        .mint(&donor, &100i128);

    let code = short_code(&env);
    s.client
        .mock_all_auths()
        .create_pool(&code, &owner, &0, &0);
    s.client
        .mock_all_auths()
        .deposit(&code, &donor, &s.xlm_like, &100i128);
    s.client
        .mock_all_auths()
        .withdraw(&code, &owner, &s.xlm_like, &outsider, &60i128);

    let donors = s.client.donors(&code);
    assert_eq!(donors.len(), 1);
    assert_eq!(donors.get(0).unwrap().0, donor);
    assert_eq!(donors.get(0).unwrap().1, 100i128);
}

#[test]
fn pool_inexistente_da_leaderboard_vacio() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let s = setup_vault(&env);

    let otro = String::from_str(&env, "noExiste12");
    let donors = s.client.mock_all_auths().donors(&otro);
    assert_eq!(donors.len(), 0);
}
