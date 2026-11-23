// The complete route table. Every screen of SeatPlan is listed here once,
// so feature owners fill in their page file and never need to touch this one.
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import EditorPage from "./pages/editor/EditorPage";
import AttendeePage from "./pages/events/AttendeePage";
import OrganiserPage from "./pages/events/OrganiserPage";
import AccountPage from "./pages/account/AccountPage";
import ForgotPage from "./pages/account/ForgotPage";
import GuestSignInPage from "./pages/account/GuestSignInPage";
import MyEventsPage from "./pages/account/MyEventsPage";
import MySeatPage from "./pages/account/MySeatPage";
import ResetPage from "./pages/account/ResetPage";
import DinerAccountPage from "./pages/discover/DinerAccountPage";
import DinerSignUpPage from "./pages/discover/DinerSignUpPage";
import DinerSocialCallbackPage from "./pages/discover/DinerSocialCallbackPage";
import DiscoverRoute from "./pages/discover/DiscoverRoute";
import Home from "./pages/Home";
import JoinPage from "./pages/join/JoinPage";
import JoinSignInPage from "./pages/join/JoinSignInPage";
import RegisterPage from "./pages/join/RegisterPage";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import OwnerHomePage from "./pages/owner/OwnerHomePage";
import OwnerSignUpPage from "./pages/owner/OwnerSignUpPage";
import NewRestaurantWizard from "./pages/owner/NewRestaurantWizard";
import ProfilePage from "./pages/owner/ProfilePage";
import PhotoEditorPage from "./pages/owner/PhotoEditor";
import BookingPage from "./pages/restaurant/BookingPage";
import RestaurantPage from "./pages/restaurant-public/RestaurantPage";
import ManageBookingPage from "./pages/restaurant/ManageBookingPage";
import WeatherRainOffer from "./pages/restaurant/WeatherRainOffer";
import HoursPage from "./pages/owner/HoursPage";
import MenuPage from "./pages/owner/MenuPage";
import PublishReview from "./pages/owner/PublishReview";
import UnsubscribePage from "./pages/legal/UnsubscribePage";
import InsightsPage from "./pages/owner/InsightsPage";
import ForgotPasswordPage from "./pages/owner/ForgotPasswordPage";
import MessagesPage from "./pages/owner/EmailMessagesPage";
import OffersPage from "./pages/owner/OffersPage";
import PaymentsPage from "./pages/owner/PaymentsPage";
import ResetPasswordPage from "./pages/owner/ResetPasswordPage";
import SecurityPage from "./pages/owner/SecurityPage";
import SocialCallbackPage from "./pages/owner/SocialCallbackPage";
import TermsPage from "./pages/owner/TermsPage";
import DemoCheckoutPage from "./pages/pay/DemoCheckoutPage";
import MessageActionPage from "./pages/messages/MessageActionPage";
import PaymentReturnPage from "./pages/pay/PaymentReturnPage";
const RoomEditorPage = lazy(() => import("./pages/room-editor/RoomEditorPage"));

function ToOpeningHours() {
  const { venueId = "" } = useParams();
  return <Navigate to={`/owner/${encodeURIComponent(venueId)}/hours`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverRoute />} />
      {/* The original SeatPlan home page, with the demo links, moved here (spec 4.1). */}
      <Route path="/demo" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/owner" element={<OwnerHomePage />} />
      <Route path="/owner/sign-up" element={<OwnerSignUpPage />} />
      <Route path="/owner/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/owner/sign-in/callback" element={<SocialCallbackPage />} />
      <Route path="/owner/:venueId/security" element={<SecurityPage />} />
      <Route path="/owner/reset-password" element={<ResetPasswordPage />} />
      <Route path="/owner/new" element={<NewRestaurantWizard />} />
      <Route path="/owner/:venueId/setup" element={<NewRestaurantWizard />} />
      <Route path="/owner/:venueId/profile" element={<ProfilePage />} />
      <Route path="/owner/:venueId/photos" element={<PhotoEditorPage />} />
      <Route path="/owner/:venueId/hours" element={<HoursPage />} />
      <Route path="/owner/:venueId/menu" element={<MenuPage />} />
      <Route path="/owner/:venueId/payments" element={<PaymentsPage />} />
      <Route path="/owner/:venueId/messages" element={<MessagesPage />} />
      <Route path="/owner/:venueId/insights" element={<InsightsPage />} />
      <Route path="/owner/:venueId/offers" element={<OffersPage />} />
      <Route path="/owner/:venueId/terms" element={<TermsPage />} />
      <Route path="/u/:token" element={<UnsubscribePage />} />
      <Route path="/m/:token" element={<MessageActionPage />} />
      <Route path="/owner/:venueId/review" element={<PublishReview />} />
      <Route path="/owner/sign-in" element={<Login defaultNext="/owner" />} />
      {/* The service floor and the staff workspace were removed: SeatPlan is for bookings, not for the day-to-day service. */}
      <Route path="/owner/:venueId/dashboard" element={<ToOpeningHours />} />
      <Route path="/owner/:venueId/rooms" element={<Suspense fallback={<p role="status">Loading room editor…</p>}><RoomEditorPage /></Suspense>} />
      {/* Events: personal attendee link, organiser workspace */}
      <Route path="/e/:token" element={<AttendeePage />} />
      <Route path="/organiser/:eventId" element={<OrganiserPage />} />
      {/* Events: the shared link (visitors) and guest accounts (docs/guest-accounts.md 10.3) */}
      <Route path="/j/:token" element={<JoinPage />} />
      <Route path="/j/:token/register" element={<RegisterPage />} />
      <Route path="/j/:token/sign-in" element={<JoinSignInPage />} />
      <Route path="/my" element={<MyEventsPage />} />
      {/* The fixed /my pages come before /my/:eventId, so "account" is never read as an event id. */}
      <Route path="/my/account" element={<AccountPage />} />
      <Route path="/my/sign-in" element={<GuestSignInPage />} />
      <Route path="/my/forgot" element={<ForgotPage />} />
      <Route path="/my/reset" element={<ResetPage />} />
      <Route path="/my/:eventId" element={<MySeatPage />} />
      {/* Restaurants: public booking, manage-or-cancel link, staff floor */}
      <Route path="/restaurants/account" element={<DinerAccountPage />} />
      <Route path="/restaurants/account/sign-up" element={<DinerSignUpPage />} />
      <Route path="/restaurants/account/callback" element={<DinerSocialCallbackPage />} />
      <Route path="/restaurants/:slug" element={<RestaurantPage />} />
      <Route path="/r/:venueId" element={<BookingPage />} />
      <Route path="/b/:token" element={<ManageBookingPage />} />
      <Route path="/b/rain/:token" element={<WeatherRainOffer />} />
      {/* Deposits: the pretend payment page (demo only) and where every payment page sends the diner back. */}
      <Route path="/pay/demo/:paymentId" element={<DemoCheckoutPage />} />
      <Route path="/pay/return/:paymentId" element={<PaymentReturnPage />} />
      <Route path="/staff/:venueId" element={<Navigate to="/owner" replace />} />
      {/* Shared: floor-plan editor for both kinds of venue */}
      <Route path="/editor/:venueId" element={<EditorPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
