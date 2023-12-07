import {
  sampleRUM,
  buildBlock,
  getMetadata,
  getAllMetadata,
  loadHeader,
  loadFooter,
  toCamelCase,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForLCP,
  loadBlocks,
  loadCSS,
  toClassName,
  loadScript,
} from './lib-franklin.js';
import {
  analyticsTrack404,
  analyticsTrackConversion,
  analyticsTrackCWV,
  analyticsTrackError,
  initAnalyticsTrackingQueue,
  setupAnalyticsTrackingWithAlloy,
} from './analytics/lib-analytics.js';

const LCP_BLOCKS = []; // add your LCP blocks to the list
window.hlx.RUM_GENERATION = 'project-1'; // add your RUM generation information here

const AUDIENCES = {
  all: () => true,
  mobile: () => window.innerWidth < 600,
  desktop: () => window.innerWidth >= 600,
  new: () => !localStorage.getItem('franklin-visitor-returning'),
  returning: () => !!localStorage.getItem('franklin-visitor-returning'),
};

// Define an execution context
const pluginContext = {
  getAllMetadata,
  getMetadata,
  loadCSS,
  loadScript,
  sampleRUM,
  toCamelCase,
  toClassName,
};

/**
 * Determine if we are serving content for the block-library, if so don't load the header or footer
 * @returns {boolean} True if we are loading block library content
 */
export function isBlockLibrary() {
  return window.location.pathname.includes('block-library');
}

/**
 * Convience method for creating tags in one line of code
 * @param {string} tag Tag to create
 * @param {object} attributes Key/value object of attributes
 * @param {HTMLElement | HTMLElement[] | string} children Child element
 * @returns {HTMLElement} The created tag
 */
export function createTag(tag, attributes, children) {
  const element = document.createElement(tag);
  if (children) {
    if (children instanceof HTMLElement
      || children instanceof SVGElement
      || children instanceof DocumentFragment) {
      element.append(children);
    } else if (Array.isArray(children)) {
      element.append(...children);
    } else {
      element.insertAdjacentHTML('beforeend', children);
    }
  }
  if (attributes) {
    Object.entries(attributes).forEach(([key, val]) => {
      element.setAttribute(key, val);
    });
  }
  return element;
}

function buildHeroBlock(main) {
  const h1 = main.querySelector('main > div > h1');
  const picture = main.querySelector('main > div > p > picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

function patchDemoBlocks(config) {
  if (window.wknd.demoConfig.blocks && window.wknd.demoConfig.blocks[config.blockName]) {
    const url = window.wknd.demoConfig.blocks[config.blockName];
    const splits = new URL(url).pathname.split('/');
    const [, owner, repo, , branch] = splits;
    const path = splits.slice(5).join('/');

    const franklinPath = `https://little-forest-58aa.david8603.workers.dev/?url=https://${branch}--${repo}--${owner}.hlx.live/${path}`;
    return {
      ...config,
      jsPath: `${franklinPath}/${config.blockName}.js`,
      cssPath: `${franklinPath}/${config.blockName}.css`,
    };
  }
  return (config);
}

async function loadDemoConfig() {
  const demoConfig = {};
  const pathSegments = window.location.pathname.split('/');
  if (window.location.pathname.startsWith('/drafts/') && pathSegments.length > 4) {
    const demoBase = pathSegments.slice(0, 4).join('/');
    const resp = await fetch(`${demoBase}/theme.json?sheet=default&sheet=blocks&`);
    if (resp.status === 200) {
      const json = await resp.json();
      const tokens = json.data || json.default.data;
      const root = document.querySelector(':root');
      tokens.forEach((e) => {
        root.style.setProperty(`--${e.token}`, `${e.value}`);
        demoConfig[e.token] = e.value;
      });
      demoConfig.tokens = tokens;
      demoConfig.demoBase = demoBase;
      const blocks = json.blocks ? json.blocks.data : [];
      demoConfig.blocks = {};
      blocks.forEach((block) => {
        demoConfig.blocks[block.name] = block.url;
      });

      window.hlx.patchBlockConfig.push(patchDemoBlocks);
    }

    if (!demoConfig.demoBase) {
      const navCheck = await fetch(`${demoBase}/nav.plain.html`);
      if (navCheck.status === 200) {
        demoConfig.demoBase = demoBase;
      }
    }
  }
  window.wknd = window.wknd || {};
  window.wknd.demoConfig = demoConfig;
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);

  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * loads everything needed to get to LCP.
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();

  // load experiments
  if (getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadEager: runEager } = await import('../plugins/experience-decisioning/src/index.js');
    await runEager(document, { audiences: AUDIENCES }, pluginContext);
  }

  // load demo config
  await loadDemoConfig();

  const main = doc.querySelector('main');
  if (main) {
    await initAnalyticsTrackingQueue();
    decorateMain(main);
    await waitForLCP(LCP_BLOCKS);
  }
}

/**
 * Adds the favicon.
 * @param {string} href The favicon URL
 */
export function addFavIcon(href) {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = href;
  const existingLink = document.querySelector('head link[rel="icon"]');
  if (existingLink) {
    existingLink.parentElement.replaceChild(link, existingLink);
  } else {
    document.getElementsByTagName('head')[0].appendChild(link);
  }
}

/**
 * loads everything that doesn't need to be delayed.
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadBlocks(main);

  const { hash } = window.location;
  const element = hash ? main.querySelector(hash) : false;
  if (hash && element) element.scrollIntoView();

  if (!isBlockLibrary()) {
    loadHeader(doc.querySelector('header'));
    loadFooter(doc.querySelector('footer'));
  }

  if (window.wknd.demoConfig.fonts) {
    const fonts = window.wknd.demoConfig.fonts.split('\n');
    fonts.forEach(async (font) => {
      const [family, url] = font.split(': ');
      const ff = new FontFace(family, `url('${url}')`);
      await ff.load();
      document.fonts.add(ff);
    });
  } else {
    loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  }
  addFavIcon(`${window.wknd.demoConfig.demoBase || window.hlx.codeBasePath}/favicon.png`);
  sampleRUM('lazy');
  sampleRUM.observe(main.querySelectorAll('div[data-block-name]'));
  sampleRUM.observe(main.querySelectorAll('picture > img'));

  // Mark customer as having viewed the page once
  localStorage.setItem('franklin-visitor-returning', true);

  const context = {
    getMetadata,
    toClassName,
  };
  // eslint-disable-next-line import/no-relative-packages
  const { initConversionTracking } = await import('../plugins/rum-conversion/src/index.js');
  await initConversionTracking.call(context, document);

  if ((getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length)) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadLazy: runLazy } = await import('../plugins/experience-decisioning/src/index.js');
    await runLazy(document, { audiences: AUDIENCES }, pluginContext);
  }
}

/**
 * loads everything that happens a lot later, without impacting
 * the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  pushPageLoadToDataLayer();

  await loadEager(document);
  await loadLazy(document);
  const setupAnalytics = setupAnalyticsTrackingWithAlloy(document);
  loadDelayed();
  await setupAnalytics;
}

const cwv = {};

// Forward the RUM CWV cached measurements to edge using WebSDK before the page unloads
window.addEventListener('beforeunload', () => {
  if (!Object.keys(cwv).length) return;
  analyticsTrackCWV(cwv);
});

// Callback to RUM CWV checkpoint in order to cache the measurements
sampleRUM.always.on('cwv', async (data) => {
  if (!data.cwv) return;
  Object.assign(cwv, data.cwv);
});

sampleRUM.always.on('404', analyticsTrack404);
sampleRUM.always.on('error', analyticsTrackError);

// Declare conversionEvent, bufferTimeoutId and tempConversionEvent,
// outside the convert function to persist them for buffering between
// subsequent convert calls
const CONVERSION_EVENT_TIMEOUT_MS = 100;
let bufferTimeoutId;
let conversionEvent;
let tempConversionEvent;
sampleRUM.always.on('convert', (data) => {
  const { element } = data;
  // eslint-disable-next-line no-undef
  if (!element || !alloy) {
    return;
  }

  if (element.tagName === 'FORM') {
    conversionEvent = {
      ...data,
      event: 'Form Complete',
    };

    if (conversionEvent.event === 'Form Complete'
      // Check for undefined, since target can contain value 0 as well, which is falsy
      && (data.target === undefined || data.source === undefined)
    ) {
      // If a buffer has already been set and tempConversionEvent exists,
      // merge the two conversionEvent objects to send to alloy
      if (bufferTimeoutId && tempConversionEvent) {
        conversionEvent = { ...tempConversionEvent, ...conversionEvent };
      } else {
        // Temporarily hold the conversionEvent object until the timeout is complete
        tempConversionEvent = { ...conversionEvent };

        // If there is partial form conversion data,
        // set the timeout buffer to wait for additional data
        bufferTimeoutId = setTimeout(async () => {
          analyticsTrackConversion({ ...conversionEvent });
          tempConversionEvent = undefined;
          conversionEvent = undefined;
        }, CONVERSION_EVENT_TIMEOUT_MS);
      }
    }
    return;
  }

  analyticsTrackConversion({ ...data });
  tempConversionEvent = undefined;
  conversionEvent = undefined;
});

const TRACKED_PRODUCTS = [];
export const METADATA_ANAYTICS_TAGS = 'analytics-tags';
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_COUNTRY = 'us';

function getDomainInfo(hostname) {
  const domain = hostname.match(/^(?:.*?\.)?([a-zA-Z0-9\\_]{3,}(\.|:)?(?:\w{2,8}|\w{2,4}\.\w{2,4}))$/);
  return {
    domain: domain[1],
    domainPartsCount: domain[1].split('.').length,
  };
}

export function getLanguageCountryFromPath() {
  return {
    language: DEFAULT_LANGUAGE,
    country: DEFAULT_COUNTRY,
  };
}

/**
 * Returns the environment name based on the hostname
 * @returns {String}
 */
export function getEnvironment(hostname, country) {
  if (hostname.includes('hlx.page') || hostname.includes('hlx.live')) {
    return 'stage';
  }
  if (hostname.includes(`.${country}`)) {
    return 'prod';
  }
  return 'dev';
}

export function getTags(tags) {
  return tags ? tags.split(':').filter((tag) => !!tag).map((tag) => tag.trim()) : [];
}

/**
 * Returns the value of a query parameter
 * @returns {String}
 */
function getParamValue(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Returns the current user operating system based on userAgent
 * @returns {String}
 */
export function getOperatingSystem(userAgent) {
  const systems = [
    ['Windows NT 10.0', 'Windows 10'],
    ['Windows NT 6.2', 'Windows 8'],
    ['Windows NT 6.1', 'Windows 7'],
    ['Windows NT 6.0', 'Windows Vista'],
    ['Windows NT 5.1', 'Windows XP'],
    ['Windows NT 5.0', 'Windows 2000'],
    ['X11', 'X11'],
    ['Linux', 'Linux'],
    ['Android', 'Android'],
    ['iPhone', 'iOS'],
    ['iPod', 'iOS'],
    ['iPad', 'iOS'],
    ['Mac', 'MacOS'],
  ];

  return systems.find(([substr]) => userAgent.includes(substr))?.[1] || 'Unknown';
}

/**
 * Returns the current user time in the format HH:MM|HH:00-HH:59|dayOfWeek|timezone
 * @returns {String}
 */
function getCurrentTime() {
  const date = new Date();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const dayOfWeek = date.getDay();
  const timezone = date.toTimeString().split(' ')[1];
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${hours}:${minutes}|${hours}:00-${hours}:59|${weekday[dayOfWeek]}|${timezone}`;
}

/**
 * Returns the current GMT date in the format DD/MM/YYYY
 * @returns {String}
 */
function getCurrentDate() {
  const date = new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function pushPageLoadToDataLayer() {
  const { hostname } = window.location;
  if (!hostname) {
    return;
  }

  const { domain, domainPartsCount } = getDomainInfo(hostname);
  const languageCountry = getLanguageCountryFromPath(window.location.pathname);
  const environment = getEnvironment(hostname, languageCountry.country);
  const tags = getTags(getMetadata(METADATA_ANAYTICS_TAGS));
  pushToDataLayer('page load started', {
    pageInstanceID: environment,
    page: {
      info: {
        name: [languageCountry.country, ...tags].join(':'), // e.g. au:consumer:product:internet security
        section: languageCountry.country || '',
        subSection: tags[0] || '',
        subSubSection: tags[1] || '',
        subSubSubSection: tags[2] || '',
        destinationURL: window.location.href,
        queryString: window.location.search,
        referringURL: getParamValue('adobe_mc_ref') || getParamValue('ref') || document.referrer || '',
        serverName: 'hlx.live', // indicator for AEM Success Edge
        language: navigator.language || navigator.userLanguage || languageCountry.language,
        sysEnv: getOperatingSystem(window.navigator.userAgent),
      },
      attributes: {
        promotionID: getParamValue('pid') || '',
        internalPromotionID: getParamValue('icid') || '',
        trackingID: getParamValue('cid') || '',
        time: getCurrentTime(),
        date: getCurrentDate(),
        domain,
        domainPeriod: domainPartsCount,
      },
    },
  });
}

export function pushToDataLayer(event, payload) {
  if (!event) {
    // eslint-disable-next-line no-console
    console.error('The data layer event is missing');
    return;
  }
  if (!window.adobeDataLayer) {
    window.adobeDataLayer = [];
    window.adobeDataLayerInPage = true;
  }
  window.adobeDataLayer.push({ event, ...payload });
}

export function pushProductsToDataLayer() {
  if (TRACKED_PRODUCTS.length > 0) {
    pushToDataLayer('product loaded', {
      product: TRACKED_PRODUCTS
          .map((p) => ({
            info: {
              ID: p.platformProductId,
              name: getMetadata('breadcrumb-title') || getMetadata('og:title'),
              devices: p.devices,
              subscription: p.subscription,
              version: p.version,
              basePrice: p.basePrice,
              discountValue: p.discount,
              discountRate: p.discountRate,
              currency: p.currency,
              priceWithTax: p.actualPrice,
            },
          })),
    });
  }
}

export function trackProduct(product) {
  // eslint-disable-next-line max-len
  const isDuplicate = TRACKED_PRODUCTS.find((p) => p.platformProductId === product.platformProductId && p.variantId === product.variantId);
  const tags = getTags(getMetadata(METADATA_ANAYTICS_TAGS));
  const isTrackedPage = tags.includes('product') || tags.includes('service');
  if (isTrackedPage && !isDuplicate) TRACKED_PRODUCTS.push(product);
}

export function decorateBlockWithRegionId(element, id) {
  // we could consider to use `element.setAttribute('s-object-region', id);` in the future
  if (element) element.id = id;
}

export function decorateLinkWithLinkTrackingId(element, id) {
  if (element) element.setAttribute('s-object-id', id);
}

loadPage();
