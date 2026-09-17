import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { WalletProvider } from './context/WalletContext'
import { CreatePoolPage } from './pages/CreatePoolPage'
import { FamilyPoolPage } from './pages/FamilyPoolPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { PoolDetailPage } from './pages/PoolDetailPage'
import { PoolsHomePage } from './pages/PoolsHomePage'
import { ProfilePage } from './pages/ProfilePage'
import { ReceivePage } from './pages/ReceivePage'
import { SendPage } from './pages/SendPage'
import { TrackPage } from './pages/TrackPage'

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/enviar" element={<SendPage />} />
            <Route path="/recibir" element={<ReceivePage />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/track/:txHash" element={<TrackPage />} />
            <Route path="/track" element={<TrackPage />} />
            <Route path="/pools" element={<PoolsHomePage />} />
            <Route path="/pools/nuevo" element={<CreatePoolPage />} />
            <Route path="/pools/:shortCode" element={<PoolDetailPage />} />
            <Route path="/familia" element={<FamilyPoolPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  )
}
