# Kiku PIN -> Provider Location Resolution

When a user provides a six-digit Indian PIN code, Kiku resolves it before an Apify lookup.

1. `api.postalpincode.in` supplies postal-office metadata such as division, district, state, and post-office names.
2. OpenStreetMap Nominatim supplies a cached PIN-area city/coordinate anchor when available.
3. Swiggy Thirdwatch receives the resolved latitude/longitude; its current Actor documentation says custom coordinates override city selection.
4. Zomato Thirdwatch receives the resolved city because its current documented input is city-based and does not expose custom latitude/longitude in the published input schema.
5. The resolved PIN remains the cache key. Food/provider results are stored in Kiku's 24-hour regional snapshot and retained for stale fallback for up to 7 days.

The geocoder is configurable. The public Nominatim service is deliberately rate-limited and cached; for higher-volume deployment, replace `PIN_RESOLVER_GEOCODE_BASE_URL` with an approved provider or a self-hosted geocoder.

A resolved coordinate is a geographic anchor, not a guarantee that a restaurant delivers to the exact postal boundary. Kiku still only marks provider data as region-verified when there is provider PIN evidence or, for Swiggy, the result was obtained through the Actor's custom-coordinate targeting. Zomato results are additionally checked against the resolved city when the Actor exposes a city field.
