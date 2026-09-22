export function normalizeRegionPincode(value) {
  const normalized = String(value || "").trim();
  return /^[1-9]\d{5}$/.test(normalized) ? normalized : null;
}

export function normalizeRegionCatalog(snapshot = {}, pincode) {
  const normalizedPincode = normalizeRegionPincode(snapshot.pincode || pincode);
  if (!normalizedPincode) return null;
  return {
    pincode: normalizedPincode,
    dishes: Array.isArray(snapshot.dishes) ? snapshot.dishes.filter(Boolean).slice(0, 1500) : [],
    restaurants: Array.isArray(snapshot.restaurants) ? snapshot.restaurants.filter(Boolean).slice(0, 400) : [],
    offers: Array.isArray(snapshot.offers) ? snapshot.offers.filter(Boolean).slice(0, 2500) : [],
    checkedAt: snapshot.checkedAt || snapshot.checked_at || null,
  };
}


export function normalizeRegionSnapshot(payload = {}, pincode) {
  const root = payload?.region && typeof payload.region === "object" ? payload.region : payload;
  const requestedPincode = normalizeRegionPincode(pincode);
  const upstreamPincode = normalizeRegionPincode(root?.pincode);
  if (!requestedPincode) throw Object.assign(new Error("A valid 6-digit pincode is required."), { code: "REGION_INVALID_PIN", status: 400 });
  if (upstreamPincode && upstreamPincode !== requestedPincode) throw Object.assign(new Error("Regional scraper returned data for a different pincode."), { code: "REGION_PIN_MISMATCH", status: 502 });
  const normalizedPincode = requestedPincode;
  const dishes = Array.isArray(root?.dishes) ? root.dishes.filter((item) => item && typeof item === "object").slice(0, 1500).map((item) => ({ ...item, regionPincode: normalizedPincode })) : [];
  const restaurants = Array.isArray(root?.restaurants) ? root.restaurants.filter((item) => item && typeof item === "object").slice(0, 400).map((item) => ({ ...item, regionPincode: normalizedPincode })) : [];
  const offers = Array.isArray(root?.offers) ? root.offers.filter((item) => item && typeof item === "object").slice(0, 2500) : [];
  return {
    pincode: normalizedPincode,
    dishes,
    restaurants,
    offers,
    checkedAt: root?.checkedAt || root?.checked_at || new Date().toISOString(),
  };
}
