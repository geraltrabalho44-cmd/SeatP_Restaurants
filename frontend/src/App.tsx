// The complete route table. Every screen of SeatPlan is listed here once,
// so feature owners fill in their page file and never need to touch this one.
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Skeleton } from "./design/components";
import DinerAccountPage from "./pages/discover/DinerAccountPage";
import DinerSignUpPage from "./pages/discover/DinerSignUpPage";
import DinerSocialCallbackPage from "./pages/discover/DinerSocialCallbackPage";
import DiscoverRoute from "./pages/discover/DiscoverRoute";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import BookingPage from "./pages/restaurant/BookingPage";
import RestaurantPage from "./pages/restaurant-public/RestaurantPage";
import ManageBookingPage from "./pages/restaurant/ManageBookingPage";
// Only what the first screen needs is in the first download. Every other page is fetched when its
// route is opened, so a diner looking for a table does not also download the owner and event tools.
const EditorPage = lazy(() => import("./pages/editor/EditorPage"));
const AttendeePage = lazy(() => import("./pages/events/AttendeePage"));
const OrganiserPage = lazy(() => import("./pages/events/OrganiserPage"));
const AccountPage = lazy(() => import("./pages/account/AccountPage"));
const ForgotPage = lazy(() => import("./pages/account/ForgotPage"));
const GuestSignInPage = lazy(() => import("./pages/account/GuestSignInPage"));
const MyEventsPage = lazy(() => import("./pages/account/MyEventsPage"));
const MySeatPage = lazy(() => import("./pages/account/MySeatPage"));
const ResetPage = lazy(() => import("./pages/account/ResetPage"));
const Home = lazy(() => import("./pages/Home"));
const JoinPage = lazy(() => import("./pages/join/JoinPage"));
const JoinSignInPage = lazy(() => import("./pages/join/JoinSignInPage"));
const RegisterPage = lazy(() => import("./pages/join/RegisterPage"));
const OwnerHomePage = lazy(() => import("./pages/owner/OwnerHomePage"));
const OwnerSignUpPage = lazy(() => import("./pages/owner/OwnerSignUpPage"));
const NewRestaurantWizard = lazy(() => import("./pages/owner/NewRestaurantWizard"));
const ProfilePage = lazy(() => import("./pages/owner/ProfilePage"));
const PhotoEditorPage = lazy(() => import("./pages/owner/PhotoEditor"));
import WeatherRainOffer from "./pages/restaurant/WeatherRainOffer";
const HoursPage = lazy(() => import("./pages/owner/HoursPage"));
const MenuPage = lazy(() => import("./pages/owner/MenuPage"));
const PublishReview = lazy(() => import("./pages/owner/PublishReview"));
const UnsubscribePage = lazy(() => import("./pages/legal/UnsubscribePage"));
const InsightsPage = lazy(() => import("./pages/owner/InsightsPage"));
const ForgotPasswordPage = lazy(() => import("./pages/owner/ForgotPasswordPage"));
const MessagesPage = lazy(() => import("./pages/owner/EmailMessagesPage"));
const OffersPage = lazy(() => import("./pages/owner/OffersPage"));
const PaymentsPage = lazy(() => import("./pages/owner/PaymentsPage"));
const ResetPasswordPage = lazy(() => import("./pages/owner/ResetPasswordPage"));
const SecurityPage = lazy(() => import("./pages/owner/SecurityPage"));
const SocialCallbackPage = lazy(() => import("./pages/owner/SocialCallbackPage"));
const TermsPage = lazy(() => import("./pages/owner/TermsPage"));
const DemoCheckoutPage = lazy(() => import("./pages/pay/DemoCheckoutPage"));
const MessageActionPage = lazy(() => import("./pages/messages/MessageActionPage"));
const PaymentReturnPage = lazy(() => import("./pages/pay/PaymentReturnPage"));
const RoomEditorPage = lazy(() => import("./pages/room-editor/RoomEditorPage"));

function ToOpeningHours() {
  const { venueId = "" } = useParams();
  return <Navigate to={`/owner/${encodeURIComponent(venueId)}/hours`} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Skeleton lines={4} label="Loading" />}>
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
      <Route path="/owner/:venueId/rooms" element={<RoomEditorPage />} />
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
    </Suspense>
  );
}
