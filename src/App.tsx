import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { OwnerLayout } from '@/layouts/OwnerLayout'
import { RequireAdmin } from '@/components/layout/RequireAdmin'
import { RequireOwner } from '@/components/layout/RequireOwner'
import { RequireScorekeeper } from '@/components/layout/RequireScorekeeper'
import { ScorekeeperLayout } from '@/layouts/ScorekeeperLayout'

import Home from '@/pages/public/Home'
import Matches from '@/pages/public/Matches'
import Exhibitions from '@/pages/public/Exhibitions'
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
import AdminExhibitions from '@/pages/admin/AdminExhibitions'
import AdminExhibitionDetail from '@/pages/admin/AdminExhibitionDetail'

import OwnerLogin from '@/pages/owner/OwnerLogin'
import OwnerClaim from '@/pages/owner/OwnerClaim'
import OwnerStrategyConfig from '@/pages/owner/OwnerStrategyConfig'
import OwnerRetention from '@/pages/owner/OwnerRetention'
import OwnerAuction from '@/pages/owner/OwnerAuction'

import ScorekeeperLogin from '@/pages/scorekeeper/ScorekeeperLogin'
import ScorekeeperMatches from '@/pages/scorekeeper/ScorekeeperMatches'
import ScorekeeperTracker from '@/pages/scorekeeper/ScorekeeperTracker'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/exhibitions" element={<Exhibitions />} />
        <Route path="/exhibitions/:matchId" element={<MatchScorecard />} />
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
          <Route path="/admin/exhibitions" element={<AdminExhibitions />} />
          <Route path="/admin/exhibitions/:matchId" element={<AdminExhibitionDetail />} />
        </Route>
      </Route>

      <Route path="/owner/login" element={<OwnerLogin />} />
      <Route path="/owner/claim/:token" element={<OwnerClaim />} />

      <Route element={<RequireOwner />}>
        <Route element={<OwnerLayout />}>
          <Route path="/owner/strategy" element={<OwnerStrategyConfig />} />
          <Route path="/owner/retention" element={<OwnerRetention />} />
          <Route path="/owner/auction" element={<OwnerAuction />} />
        </Route>
      </Route>

      <Route path="/scorekeeper/login" element={<ScorekeeperLogin />} />

      <Route element={<RequireScorekeeper />}>
        <Route element={<ScorekeeperLayout />}>
          <Route path="/scorekeeper" element={<ScorekeeperMatches />} />
          <Route path="/scorekeeper/matches/:matchId" element={<ScorekeeperTracker />} />
        </Route>
      </Route>
    </Routes>
  )
}
