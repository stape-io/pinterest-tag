# Pinterest Conversion API Tag for Google Tag Manager Server Container

## How to use Pinterest tag

---
**Event Name Setup Method** - select from a list of standard events, add a custom event, or choose to Inherit an event name from a client. When Inherit from client is selected, the Pinterest CAPI tag will try to map events automatically into standard events or use a custom name if it’s impossible to map into a starred event.

**Pinterest Advertiser ID** - You can find it by logging into the Pinterest account that owns your advertiser account, then going to "ads.pinterest.com." In the top navigation section, click "Viewing: " and the advertiser id will be the number underneath the ad account name in the drop-down menu. If your Pinterest account has multiple ad accounts, make sure you are choosing the proper one that you want to use for owning your API conversion events. Another way to confirm your advertiser id is to navigate to Ads > Overview and look for the id in the URL path. It will look like: "ads.pinterest.com/advertiser/ADVERTISER_ID/?...".

**Test request** - The events will not be recorded, but the API will still return the same response messages. Use this mode to verify your requests are working and that your events are constructed correctly.

**Server Event Data Override** - select from a list of custom data.

**User Data** - select from a list of user data.

**Custom Data** - select from a list of product data.

**Logs Settings** - choose if you want to log requests to your stape account. This feature is handy when setting up server-side tagging since it allows seeing incoming and outgoing requests and network responses.

## Benefits of Pinterest tag:
- Supports event deduplication.
- Supports standard and custom events.
- Supports real-time server event testing.
- Does not require Access Token. You should use only a Pinterest advertiser ID.
- You can send event and product data.

## Useful link:
- https://stape.io/blog/pinterest-conversion-api 
## Open Source

Pinterest Tag for GTM Server Side is developing and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
