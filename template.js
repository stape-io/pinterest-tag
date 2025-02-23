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
const getRequestQueryParameter = require('getRequestQueryParameter');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

const commonCookie = eventData.common_cookie || {};

let postUrl =
  'https://api.pinterest.com/v5/ad_accounts/' + data.advertiserId + '/events';
setClickIdCookieIfNeeded();
const mappedEventData = mapEvent(eventData, data);
const postBody = { data: [mappedEventData] };

if (data.testMode) {
  postUrl = postUrl + '?test=true';
}

log({
  Name: 'Pinterest',
  Type: 'Request',
  TraceId: traceId,
  EventName: mappedEventData.event_name,
  RequestMethod: 'POST',
  RequestUrl: postUrl,
  RequestBody: postBody,
});

sendHttpRequest(
  postUrl,
  (statusCode, headers, body) => {
    log({
      Name: 'Pinterest',
      Type: 'Response',
      TraceId: traceId,
      EventName: mappedEventData.event_name,
      ResponseStatusCode: statusCode,
      ResponseHeaders: headers,
      ResponseBody: body,
    });

    if (!data.useOptimisticScenario) {
      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    }
  },
  {
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + data.apiAccessToken,
    },
    method: 'POST',
  },
  JSON.stringify(postBody)
);

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}
function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    let eventName = eventData.event_name;
    eventName = eventName.toLowerCase().trim();
    let gaToEventName = {
      page_view: 'page_visit',
      'gtm.dom': 'page_visit',
      add_payment_info: 'custom',
      add_to_cart: 'add_to_cart',
      add_to_wishlist: 'custom',
      sign_up: 'signup',
      begin_checkout: 'custom',
      generate_lead: 'lead',
      purchase: 'checkout',
      search: 'search',
      view_item_list: 'view_category',
      view_item: 'custom',

      contact: 'lead',
      customize_product: 'custom',
      donate: 'custom',
      find_location: 'search',
      schedule: 'custom',
      start_trial: 'custom',
      submit_application: 'lead',
      subscribe: 'custom',

      'gtm4wp.addProductToCartEEC': 'add_to_cart',
      'gtm4wp.productClickEEC': 'custom',
      'gtm4wp.checkoutOptionEEC': 'checkout',
      'gtm4wp.checkoutStepEEC': 'custom',
      'gtm4wp.orderCompletedEEC': 'checkout',
    };

    if (!gaToEventName[eventName]) {
      return 'custom';
    }

    return gaToEventName[eventName];
  }
  return data.eventNameStandard;
}

function mapEvent(eventData, data) {
  let eventName = getEventName(eventData, data);

  let mappedData = {
    event_name: eventName,
    action_source: data.actionSource || 'web',
    partner_name: 'ss-stape',
    event_time: Math.round(getTimestampMillis() / 1000),
    custom_data: {
      np: 'ss-stape',
    },
    user_data: {},
  };

  if (mappedData.action_source === 'web') {
    mappedData.event_source_url = eventData.page_location;
    mappedData.user_data = {
      client_ip_address: eventData.ip_override,
      client_user_agent: eventData.user_agent,
    };
  }

  mappedData = addServerEventData(eventData, data, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addEcommerceData(eventData, mappedData);
  mappedData = overrideDataIfNeeded(data, mappedData);
  mappedData = fixValueTypes(mappedData);
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
    return value.map((val) => {
      return hashData(key, val);
    });
  }

  if (isHashed(value)) {
    return value;
  }

  value = makeString(value).trim().toLowerCase();

  if (key === 'ph') {
    value = value
      .split(' ')
      .join('')
      .split('-')
      .join('')
      .split('(')
      .join('')
      .split(')')
      .join('')
      .split('+')
      .join('');
  } else if (key === 'ct') {
    value = value.split(' ').join('');
  }

  return sha256Sync(value, { outputEncoding: 'hex' });
}

function hashDataIfNeeded(mappedData) {
  if (mappedData.user_data) {
    for (let key in mappedData.user_data) {
      if (
        key === 'em' ||
        key === 'ph' ||
        key === 'ge' ||
        key === 'db' ||
        key === 'ln' ||
        key === 'fn' ||
        key === 'ct' ||
        key === 'st' ||
        key === 'zp' ||
        key === 'country' ||
        key === 'hashed_maids' ||
        key === 'external_id'
      ) {
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
    data.userDataList.forEach((d) => {
      mappedData.user_data[d.name] = d.value;
    });
  }

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      mappedData.custom_data[d.name] = d.value;
    });
  }
  if (data.serverEventDataList) {
    data.serverEventDataList.forEach((d) => {
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
    mappedData.custom_data.contents = [];
    currencyFromItems = eventData.items[0].currency;

    eventData.items.forEach((d, i) => {
      let content = {};

      if (d.item_id) contentIds.push(d.item_id);
      if (d.quantity) {
        content.quantity = makeInteger(d.quantity);
        numItems += makeInteger(d.quantity);
      }

      if (d.price) {
        content.item_price = makeString(d.price);
        valueFromItems += d.quantity ? d.quantity * d.price : d.price;
      }

      mappedData.custom_data.contents[i] = content;
    });
  }

  if (eventData['x-ga-mp1-ev'])
    mappedData.custom_data.value = eventData['x-ga-mp1-ev'];
  else if (eventData['x-ga-mp1-tr'])
    mappedData.custom_data.value = eventData['x-ga-mp1-tr'];
  else if (eventData.value)
    mappedData.custom_data.value = makeString(eventData.value);
  else if (valueFromItems)
    mappedData.custom_data.value = makeString(valueFromItems);

  if (eventData.currency) mappedData.custom_data.currency = eventData.currency;
  else if (currencyFromItems)
    mappedData.custom_data.currency = currencyFromItems;

  if (contentIds.length) mappedData.custom_data.content_ids = contentIds;
  if (numItems) mappedData.custom_data.num_items = makeInteger(numItems);

  if (eventData.search_term)
    mappedData.custom_data.search_string = eventData.search_term;
  if (eventData.transaction_id)
    mappedData.custom_data.order_id = eventData.transaction_id;

  if (eventData.opt_out_type)
    mappedData.custom_data.opt_out_type = eventData.opt_out_type;
  if (eventData.content_name)
    mappedData.custom_data.content_name = eventData.content_name;
  if (eventData.content_category)
    mappedData.custom_data.content_category = eventData.content_category;
  if (eventData.content_brand)
    mappedData.custom_data.content_brand = eventData.content_brand;
  return mappedData;
}

function addUserData(eventData, mappedData) {
  let address = {};
  let user_data = {};
  if (getType(eventData.user_data) === 'object') {
    user_data = eventData.user_data;
    const addressType = getType(user_data.address);
    if (addressType === 'object' || addressType === 'array') {
      address = user_data.address[0] || user_data.address;
    }
  }

  if (eventData.external_id)
    mappedData.user_data.external_id = eventData.external_id;
  else if (eventData.user_id)
    mappedData.user_data.external_id = eventData.user_id;
  else if (eventData.userId)
    mappedData.user_data.external_id = eventData.userId;

  if (eventData.lastName) mappedData.user_data.ln = eventData.lastName;
  else if (eventData.LastName) mappedData.user_data.ln = eventData.LastName;
  else if (eventData.nameLast) mappedData.user_data.ln = eventData.nameLast;
  else if (eventData.last_name) mappedData.user_data.ln = eventData.last_name;
  else if (user_data.last_name) mappedData.user_data.ln = user_data.last_name;
  else if (address.last_name) mappedData.user_data.ln = address.last_name;

  if (eventData.firstName) mappedData.user_data.fn = eventData.firstName;
  else if (eventData.FirstName) mappedData.user_data.fn = eventData.FirstName;
  else if (eventData.nameFirst) mappedData.user_data.fn = eventData.nameFirst;
  else if (eventData.first_name) mappedData.user_data.fn = eventData.first_name;
  else if (user_data.first_name) mappedData.user_data.fn = user_data.first_name;
  else if (address.first_name) mappedData.user_data.fn = address.first_name;

  if (eventData.email) mappedData.user_data.em = eventData.email;
  else if (user_data.email_address)
    mappedData.user_data.em = user_data.email_address;
  else if (user_data.email) mappedData.user_data.em = user_data.email;

  if (eventData.phone) mappedData.user_data.ph = eventData.phone;
  else if (user_data.phone_number)
    mappedData.user_data.ph = user_data.phone_number;

  if (eventData.city) mappedData.user_data.ct = eventData.city;
  else if (address.city) mappedData.user_data.ct = address.city;

  if (eventData.state) mappedData.user_data.st = eventData.state;
  else if (eventData.region) mappedData.user_data.st = eventData.region;
  else if (user_data.region) mappedData.user_data.st = user_data.region;
  else if (address.region) mappedData.user_data.st = address.region;

  if (eventData.zip) mappedData.user_data.zp = eventData.zip;
  else if (eventData.postal_code)
    mappedData.user_data.zp = eventData.postal_code;
  else if (user_data.postal_code)
    mappedData.user_data.zp = user_data.postal_code;
  else if (address.postal_code) mappedData.user_data.zp = address.postal_code;

  if (eventData.countryCode)
    mappedData.user_data.country = eventData.countryCode;
  else if (eventData.country) mappedData.user_data.country = eventData.country;
  else if (user_data.country) mappedData.user_data.country = user_data.country;
  else if (address.country) mappedData.user_data.country = address.country;

  if (eventData.gender) mappedData.user_data.ge = eventData.gender;
  if (eventData.db) mappedData.user_data.db = eventData.db;
  if (eventData.hashed_maids)
    mappedData.user_data.hashed_maids = eventData.hashed_maids;
  const click_id =
    getCookieValues('_epik')[0] ||
    commonCookie._epik ||
    eventData.click_id ||
    '';
  if (click_id) mappedData.user_data.click_id = click_id;

  return mappedData;
}

function addServerEventData(eventData, data, mappedData) {
  if (eventData.event_id) mappedData.event_id = eventData.event_id;
  else if (eventData.transaction_id)
    mappedData.event_id = eventData.transaction_id;

  return mappedData;
}

function log(logObject) {
  if (isLoggingEnabled) {
    logToConsole(JSON.stringify(logObject));
  }
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

function setClickIdCookieIfNeeded() {
  const click_id = getRequestQueryParameter('epik');
  if (click_id) {
    setCookie('_epik', click_id, {
      domain: 'auto',
      path: '/',
      secure: true,
      httpOnly: true,
      'max-age': 31536000, // 1 year
    });
  }
}

function fixValueTypes(mappedData) {
  const valueType = getType(mappedData.custom_data.value);
  if (valueType === 'number') {
    mappedData.custom_data.value = makeString(mappedData.custom_data.value);
  }
  if (mappedData.custom_data.contents) {
    mappedData.custom_data.contents.forEach((content) => {
      if (getType(content.item_price) === 'number') {
        content.item_price = makeString(content.item_price);
      }
    });
  }
  return mappedData;
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}
