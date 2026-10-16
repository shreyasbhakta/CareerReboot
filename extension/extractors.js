// Per-site job description selectors, tried in order. Adding a site is adding an entry here.
// company: selectors for the employer's name. companyFrom: where the URL names the employer
// ("path" = first path segment, "subdomain"); the page title is the last resort.
globalThis.CR_EXTRACTORS = [
  {
    name: "LinkedIn",
    host: /(^|\.)linkedin\.com$/,
    selectors: [".jobs-description__content", ".jobs-box__html-content", ".show-more-less-html__markup", "#job-details"],
    company: [".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link", ".jobs-unified-top-card__company-name"],
  },
  {
    name: "Greenhouse",
    host: /(^|\.)greenhouse\.io$/,
    selectors: [".job__description", "#content .content-intro", "#content", "#app_body"],
    company: [".company-name", ".job__header .logo img[alt]"],
    companyFrom: "path",
  },
  {
    name: "Lever",
    host: /(^|\.)lever\.co$/,
    selectors: ['[data-qa="job-description"]', ".posting-page .content .section-wrapper", ".posting-page"],
    company: [".main-header-logo img[alt]"],
    companyFrom: "path",
  },
  {
    name: "Workday",
    host: /(^|\.)myworkdayjobs\.com$/,
    selectors: ['[data-automation-id="jobPostingDescription"]'],
    company: [],
    companyFrom: "subdomain",
  },
  {
    name: "Ashby",
    host: /(^|\.)ashbyhq\.com$/,
    selectors: ['[class*="_descriptionText"]', ".ashby-job-posting-right-pane", "#overview"],
    company: [],
    companyFrom: "path",
  },
];
