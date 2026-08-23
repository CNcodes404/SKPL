import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { OwnerLayout } from '@/layouts/OwnerLayout'
import { RequireAdmin } from '@/components/layout/RequireAdmin'
import { RequireOwner } from '@/components/layout/RequireOwner'

import Home from '@/pages/public/Home'
import Matches from '@/pages/public/Matches'
import Teams from '@/pages/public/Teams'
import TeamDetail from '@/pages/public/TeamDetail'
import Players from '@/pages/public/Players'
import PlayerProfile from '@/pages/public/PlayerProfile'
import MatchScorecard from '@/pages/public/MatchScorecard'
import Standings from '@/pages/public/Standings'
import Stats from '@/pages/public/Stats'
import StatsPlayerFull from '@/pages/public/StatsPlayerFull'
import StatsTeamFull from '@/pages/public/StatsTeamFull'
import About from '@/pages/public/About'
import AuctionViewer from '@/pages/public/AuctionViewer'
import NotFound from '@/pages/public/NotFound'

import AdminLogin from '@/pages/admin/AdminLogin'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminSeasons from '@/pages/admin/AdminSeasons'
import SeasonCreateWizard from '@/pages/admin/SeasonCreateWizard'
import SeasonDetail from '@/pages/admin/SeasonDetail'
import AdminAuctionRun from '@/pages/admin/AdminAuctionRun'
import AdminTeams from '@/pages/admin/AdminTeams'
import AdminPlayers from '@/pages/admin/AdminPlayers'
import AdminMatches from '@/pages/admin/AdminMatches'
import AdminMatchDetail from '@/pages/admin/AdminMatchDetail'

import OwnerLogin from '@/pages/owner/OwnerLogin'
import OwnerClaim from '@/pages/owner/OwnerClaim'
import OwnerStrategyConfig from '@/pages/owner/OwnerStrategyConfig'
import OwnerRetention from '@/pages/owner/OwnerRetention'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<TeamDetail />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:playerId" element={<PlayerProfile />} />
        <Route path="/matches/:matchId" element={<MatchScorecard />} />
        <Route path="/standings" element={<Standings />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/stats/players/:statType" element={<StatsPlayerFull />} />
        <Route path="/stats/teams/:statType" element={<StatsTeamFull />} />
        <Route path="/about" element={<About />} />
        <Route path="/auction" element={<AuctionViewer />} />
        <Route path="/auction/:seasonId" element={<AuctionViewer />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/seasons" element={<AdminSeasons />} />
          <Route path="/admin/seasons/create" element={<SeasonCreateWizard />} />
          <Route path="/admin/seasons/:seasonId" element={<SeasonDetail />} />
          <Route path="/admin/seasons/:seasonId/auction" element={<AdminAuctionRun />} />
          <Route path="/admin/teams" element={<AdminTeams />} />
          <Route path="/admin/players" element={<AdminPlayers />} />
          <Route path="/admin/matches" element={<AdminMatches />} />
          <Route path="/admin/matches/:matchId" element={<AdminMatchDetail />} />
        </Route>
      </Route>

      <Route path="/owner/login" element={<OwnerLogin />} />
      <Route path="/owner/claim/:token" element={<OwnerClaim />} />

      <Route element={<RequireOwner />}>
        <Route element={<OwnerLayout />}>
          <Route path="/owner/strategy" element={<OwnerStrategyConfig />} />
          <Route path="/owner/retention" element={<OwnerRetention />} />
        </Route>
      </Route>
    </Routes>
  )
}
