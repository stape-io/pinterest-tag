const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const Math = require('Math');
const sendHttpRequest = require('sendHttpRequest');
const getTimestampMillis = require('getTimestampMillis');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const sha256Sync = require('sha256Sync');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const makeString = require('makeString');
const makeInteger = require('makeInteger');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();

let postUrl = 'https://ct.pinterest.com/events/v3/';
const mappedEventData = mapEvent(eventData, data);
const postBody = {data: [mappedEventData]};

if (data.testMode) {
    postUrl = postUrl + '?test=true';
}

if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
        'Name': 'Pinterest',
        'Type': 'Request',
        'TraceId': traceId,
        'EventName': mappedEventData.event_name,
        'RequestMethod': 'POST',
        'RequestUrl': postUrl,
        'RequestBody': postBody,
    }));
}

sendHttpRequest(postUrl, (statusCode, headers, body) => {
    if (isLoggingEnabled) {
        logToConsole(JSON.stringify({
            'Name': 'Pinterest',
            'Type': 'Response',
            'TraceId': traceId,
            'EventName': mappedEventData.event_name,
            'ResponseStatusCode': statusCode,
            'ResponseHeaders': headers,
            'ResponseBody': body,
        }));
    }

    if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
    } else {
        data.gtmOnFailure();
    }
}, {headers: {'content-type': 'application/json'}, method: 'POST'}, JSON.stringify(postBody));

function getEventName(eventData, data) {
    if (data.eventType === 'inherit') {
        let eventName = eventData.event_name;

        let gaToEventName = {
            'page_view': 'page_visit',
            "gtm.dom": "page_visit",
            'add_payment_info': 'custom',
            'add_to_cart': 'add_to_cart',
            'add_to_wishlist': 'custom',
            'sign_up': 'signup',
            'begin_checkout': 'custom',
            'generate_lead': 'lead',
            'purchase': 'checkout',
            'search': 'search',
            'view_item': 'custom',

            'contact': 'lead',
            'customize_product': 'custom',
            'donate': 'custom',
            'find_location': 'search',
            'schedule': 'custom',
            'start_trial': 'custom',
            'submit_application': 'lead',
            'subscribe': 'custom',

            'gtm4wp.addProductToCartEEC': 'add_to_cart',
            'gtm4wp.productClickEEC': 'custom',
            'gtm4wp.checkoutOptionEEC': 'checkout',
            'gtm4wp.checkoutStepEEC': 'custom',
            'gtm4wp.orderCompletedEEC': 'checkout'
        };

        if (!gaToEventName[eventName]) {
            return eventName;
        }

        return gaToEventName[eventName];
    }

    return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEvent(eventData, data) {
    let eventName = getEventName(eventData, data);

    let mappedData = {
        event_name: eventName,
        advertiser_id: data.pixelId,
        action_source: 'web',
        event_source_url: eventData.page_location,
        event_time: Math.round(getTimestampMillis() / 1000),
        custom_data: {},
        user_data: {
            client_ip_address: eventData.ip_override,
            client_user_agent: eventData.user_agent,
        }
    };

    mappedData = addServerEventData(eventData, data, mappedData);
    mappedData = addUserData(eventData, mappedData);
    mappedData = addEcommerceData(eventData, mappedData);
    mappedData = overrideDataIfNeeded(data, mappedData);
    mappedData = cleanupData(mappedData);
    mappedData = hashDataIfNeeded(mappedData);

    return mappedData;
}

function isHashed(value) {
    if (!value) {
        return false;
    }

    return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(key, value) {
    if (!value) {
        return value;
    }

    const type = getType(value);

    if (type === 'undefined' || value === 'undefined') {
        return undefined;
    }

    if (type === 'object') {
        return value.map(val => {
            return hashData(key, val);
        });
    }

    if (isHashed(value)) {
        return value;
    }

    value = makeString(value).trim().toLowerCase();

    if (key === 'ph') {
        value = value.split(' ').join('').split('-').join('').split('(').join('').split(')').join('').split('+').join('');
    } else if (key === 'ct') {
        value = value.split(' ').join('');
    }

    return sha256Sync(value, {outputEncoding: 'hex'});
}

function hashDataIfNeeded(mappedData) {
    if (mappedData.user_data) {
        for (let key in mappedData.user_data) {
            if (key === 'em' || key === 'ph' || key === 'ge' || key === 'db' || key === 'ln' || key === 'fn' || key === 'ct' || key === 'st' || key === 'zp' || key === 'country' || key === 'hashed_maids') {
                let hashedValue = hashData(key, mappedData.user_data[key]);
                let type = getType(hashedValue);

                if (type !== 'undefined' && hashedValue !== 'undefined') {
                    if (type !== 'object' && type !== 'array') {
                        hashedValue = [hashedValue];
                    }

                    mappedData.user_data[key] = hashedValue;
                }
            }
        }
    }

    return mappedData;
}

function overrideDataIfNeeded(data, mappedData) {
    if (data.userDataList) {
        data.userDataList.forEach(d => {
            mappedData.user_data[d.name] = d.value;
        });
    }

    if (data.customDataList) {
        data.customDataList.forEach(d => {
            mappedData.custom_data[d.name] = d.value;
        });
    }
    if (data.serverEventDataList) {
        data.serverEventDataList.forEach(d => {
            mappedData[d.name] = d.value;
        });
    }

    return mappedData;
}

function cleanupData(mappedData) {
    if (mappedData.user_data) {
        let userData = {};

        for (let userDataKey in mappedData.user_data) {
            if (mappedData.user_data[userDataKey]) {
                userData[userDataKey] = mappedData.user_data[userDataKey];
            }
        }

        mappedData.user_data = userData;
    }

    if (mappedData.custom_data) {
        let customData = {};

        for (let customDataKey in mappedData.custom_data) {
            if (mappedData.custom_data[customDataKey] || customDataKey === 'value') {
                customData[customDataKey] = mappedData.custom_data[customDataKey];
            }
        }

        mappedData.custom_data = customData;
    }

    return mappedData;
}

function addEcommerceData(eventData, mappedData) {
    let currencyFromItems = '';
    let valueFromItems = 0;
    let numItems = 0;
    let contentIds = [];

    if (eventData.items && eventData.items[0]) {
        mappedData.custom_data.contents = {};
        currencyFromItems = eventData.items[0].currency;

        eventData.items.forEach((d, i) => {
            let content = {};

            if (d.item_id) contentIds.push(d.item_id);
            if (d.quantity) {
                content.quantity = makeInteger(d.quantity);
                numItems += makeInteger(d.quantity);
            }

            if (d.price) {
                content.item_price = d.price;
                valueFromItems += d.quantity ? d.quantity * d.price : d.price;
            }

            mappedData.custom_data.contents[i] = content;
        });
    }

    if (eventData['x-ga-mp1-ev']) mappedData.custom_data.value = eventData['x-ga-mp1-ev'];
    else if (eventData['x-ga-mp1-tr']) mappedData.custom_data.value = eventData['x-ga-mp1-tr'];
    else if (eventData.value) mappedData.custom_data.value = eventData.value;

    if (eventData.currency) mappedData.custom_data.currency = eventData.currency;
    else if (currencyFromItems) mappedData.custom_data.currency = currencyFromItems;

    if (contentIds.length) mappedData.custom_data.content_ids = contentIds;
    if (numItems) mappedData.custom_data.num_items = makeInteger(numItems);

    if (eventData.search_term) mappedData.custom_data.search_string = eventData.search_term;
    if (eventData.transaction_id) mappedData.custom_data.order_id = eventData.transaction_id;

    return mappedData;
}

function addUserData(eventData, mappedData) {
    if (eventData.lastName) mappedData.user_data.ln = eventData.lastName;
    else if (eventData.LastName) mappedData.user_data.ln = eventData.LastName;
    else if (eventData.nameLast) mappedData.user_data.ln = eventData.nameLast;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.last_name) mappedData.user_data.ln = eventData.user_data.address.last_name;

    if (eventData.firstName) mappedData.user_data.fn = eventData.firstName;
    else if (eventData.FirstName) mappedData.user_data.fn = eventData.FirstName;
    else if (eventData.nameFirst) mappedData.user_data.fn = eventData.nameFirst;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.first_name) mappedData.user_data.fn = eventData.user_data.address.first_name;

    if (eventData.email) mappedData.user_data.em = eventData.email;
    else if (eventData.user_data && eventData.user_data.email_address) mappedData.user_data.em = eventData.user_data.email_address;
    else if (eventData.user_data && eventData.user_data.email) mappedData.user_data.em = eventData.user_data.email;

    if (eventData.phone) mappedData.user_data.ph = eventData.phone;
    else if (eventData.user_data && eventData.user_data.phone_number) mappedData.user_data.ph = eventData.user_data.phone_number;

    if (eventData.city) mappedData.user_data.ct = eventData.city;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.city) mappedData.user_data.ct = eventData.user_data.address.city;

    if (eventData.state) mappedData.user_data.st = eventData.state;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.region) mappedData.user_data.st = eventData.user_data.address.region;

    if (eventData.zip) mappedData.user_data.zp = eventData.zip;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.postal_code) mappedData.user_data.zp = eventData.user_data.address.postal_code;

    if (eventData.countryCode) mappedData.user_data.country = eventData.countryCode;
    else if (eventData.user_data && eventData.user_data.address && eventData.user_data.address.country) mappedData.user_data.country = eventData.user_data.address.country;

    if (eventData.gender) mappedData.user_data.ge = eventData.gender;
    if (eventData.db) mappedData.user_data.db = eventData.db;

    return mappedData;
}

function addServerEventData(eventData, data, mappedData) {
    if (eventData.event_id) mappedData.event_id = eventData.event_id;
    else if (eventData.transaction_id) mappedData.event_id = eventData.transaction_id;

    return mappedData;
}

function determinateIsLoggingEnabled() {
    const containerVersion = getContainerVersion();
    const isDebug = !!(
        containerVersion &&
        (containerVersion.debugMode || containerVersion.previewMode)
    );

    if (!data.logType) {
        return isDebug;
    }

    if (data.logType === 'no') {
        return false;
    }

    if (data.logType === 'debug') {
        return isDebug;
    }

    return data.logType === 'always';
}
