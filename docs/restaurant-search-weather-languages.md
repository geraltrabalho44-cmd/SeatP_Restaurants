# Restaurant search, weather and language preview

Start the branch's backend with the existing development settings and run the database migration before the preview. Build the frontend from the same worktree. The running shared checkout only changes after integration.

## Weather

The booking time step shows the selected date's forecast. A sunset choice requires a real service start, a party-compatible free table, and sunset during the meal. Indoor windows must be within 3 m of the table and within 50 degrees of the solar azimuth. Outdoor tables also qualify. Starts closest to 45 minutes before sunset rank first. During wet weather, the table step offers available indoor tables at the selected time. Forecasts cover seven days, are reused for two hours, and may be shown as stale for up to twelve hours. Sunset calculations also work outside the forecast horizon.

An owner can opt their venue in with PUT /api/owner/restaurants/{vid}/rain-plan and an enabled boolean. No venue opts in by default. The existing scheduler calls POST /api/internal/weather/process with the cron secret. The worker checks upcoming confirmed bookings 2–36 hours ahead. At a probability of 60% or at least 0.5 mm of precipitation it can reserve an indoor alternative for up to four hours, ending at least one hour before service. A diner decides through the email or their existing manage page. Opening an email link alone makes no change. Payment and account flows remain independent. No provider account is required for the offline scenario. Review licensing before introducing commercial Open-Meteo forecasts.

New tables: weather_cache, rain_plan_policies, rain_offers. No existing table requires a new column.

## Natural-language discovery

Try “sushi for 4 near the river on Saturday”, “esplanada para 2 amanhã às 19h30 até 30€” or “marisco em Chiado”. Dates use Europe/Lisbon. Missing booking details default to today, 20:00 and two diners when the phrase requests time or party availability. Prices use existing per-person bands, not a guaranteed bill. River searches require matching saved window view data; quiet searches require a quiet zone. A radius needs a named place or selected location. Unrecognized terms remain in the name/cuisine search. Removing an interpreted chip edits the query.

## Languages

Set VITE_I18N_LOCALES=en,pt,es,fr for a multilingual preview. Query selection (?lang=pt), explicit saved selection, browser languages and English are considered in that order. Only a deliberate selection is stored on this device. Portuguese uses pt-PT. Owner-provided descriptions, restaurant names and original reviews stay in the language in which they were written. The language picker sits in the public header, inside the menu on a phone. Events remain English. Claude owns the booking, staff and owner copy and the account sign-in flows.

A database lease allows one forecast refresh per cell at a time. Provider failures back off for five minutes. WEATHER_MAX_FETCHES_PER_HOUR defaults to 200 and limits external forecast calls across all venues.
