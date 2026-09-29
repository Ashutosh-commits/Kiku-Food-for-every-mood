# Attribution / provenance

This service was rebuilt from an inspection of the public repository:

https://github.com/SanjayKH-Git/Food-Price-Clash

The original project is described as a Swiggy vs Zomato real-time price comparison website using web scraping and data analysis.

The original repository did not expose a LICENSE file at the time of inspection. This document is intentionally included so the provenance is not lost. Before publishing a public fork containing substantial copied code, contact the original author for permission or independently reimplement the needed functionality.

## PIN resolver

Kiku uses `api.postalpincode.in` for Indian PIN/post-office metadata and can use the OpenStreetMap Nominatim service for a PIN-area city/coordinate anchor. Nominatim requests are rate-limited and cached. The public Nominatim service is not a general high-volume production geocoder; for larger traffic, set `PIN_RESOLVER_GEOCODE_BASE_URL` to an approved alternative or self-hosted service.
