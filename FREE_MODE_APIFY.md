# Zero-payment fallback option: Apify Free plan

Apify currently offers a $0 Free plan with a monthly prepaid usage allowance. The Free plan does not require a credit card. When the free allowance is exhausted, Apify suspends platform use until the next billing cycle; pay-as-you-go overage is available only on paid plans. See the official Apify pricing and subscription documentation before relying on this as a production policy.

Kiku can use Apify-hosted community Swiggy/Zomato actors as a fallback data source for a small personal deployment. The current Thirdwatch actors expose programmatic APIs, and the Swiggy actor returns restaurant/dish data including dish names, current prices and `is_veg`; the Zomato actor returns restaurant data and can fetch menus when `includeMenu: true`.

This is **not** an unlimited free service and it is not an official Swiggy/Zomato API. Use it as a low-volume, cached fallback only.

For Kiku's exact regional contract, do not mark a dish `pincodeVerified=true` just because an actor found it in the same city. Only provider evidence that ties the listing to the requested PIN/serviceability may be treated as a verified regional match.

Recommended zero-payment controls:

- Keep the Apify token server-side only.
- Cache regional snapshots for as long as the product requirements allow.
- Coalesce identical in-flight PIN requests.
- Keep result counts bounded.
- Disable fallback when the account has exhausted its free allowance.
- Treat `429`, quota exhaustion and actor failures as a normal provider-unavailable state, not as proof that the PIN has no food.


## Kiku runtime integration

Kiku now has a real Apify adapter for the Thirdwatch Swiggy and Zomato Actors. The tokens are independent server-side settings. The adapter uses very small result caps, one active Actor run per provider by default, a temporary cooldown after provider errors, and Kiku's persistent 24-hour cache.

This is intentionally not described as unlimited-free usage: upstream Actor usage and the Apify account's remaining allowance control how many uncached provider results can be collected.
