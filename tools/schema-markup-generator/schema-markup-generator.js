(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const JSON_FILENAME = "opensign-schema-markup.json";
  const HTML_FILENAME = "opensign-schema-markup.html";

  // 12 Supported Schema.org Types & Field Definitions
  const SCHEMA_TYPES = [
    {
      id: "Organization",
      label: "Organization",
      keywords: "organization company corporation ngo school agency brand",
      subtypes: [
        { value: "Organization", label: "Organization (General)" },
        { value: "Corporation", label: "Corporation" },
        { value: "EducationalOrganization", label: "EducationalOrganization" },
        { value: "GovernmentOrganization", label: "GovernmentOrganization" },
        { value: "NGO", label: "NGO" },
        { value: "SportsOrganization", label: "SportsOrganization" },
      ],
      required: ["name", "url"],
      fields: [
        { key: "name", label: "Organization Name", type: "text", required: true, placeholder: "e.g. Open Sign Technologies Pvt. Ltd." },
        { key: "legalName", label: "Legal Name", type: "text", placeholder: "e.g. Open Sign Technologies Private Limited" },
        { key: "url", label: "Website URL", type: "url", required: true, placeholder: "https://www.opensign.in/" },
        { key: "logo", label: "Logo URL", type: "url", placeholder: "https://www.opensign.in/assets/open%20sign%20logo.png" },
        { key: "description", label: "Description", type: "textarea", placeholder: "Brief summary of your organization and core offerings." },
        { key: "email", label: "Email", type: "email", placeholder: "contact@example.com" },
        { key: "telephone", label: "Telephone", type: "tel", placeholder: "+91-22-4890-6200" },
        { key: "foundingDate", label: "Founding Date", type: "date" },
        { section: "Postal Address (Optional)" },
        { key: "streetAddress", label: "Street Address", type: "text", placeholder: "Senapati Bapat Marg, Lower Parel" },
        { key: "addressLocality", label: "City", type: "text", placeholder: "Mumbai" },
        { key: "addressRegion", label: "State / Region", type: "text", placeholder: "Maharashtra" },
        { key: "postalCode", label: "Postal Code", type: "text", placeholder: "400013" },
        { key: "addressCountry", label: "Country Code", type: "text", placeholder: "IN" },
      ],
      repeatables: ["socialProfiles"],
    },
    {
      id: "LocalBusiness",
      label: "LocalBusiness",
      keywords: "local business store shop restaurant clinic office address hours geo",
      subtypes: [
        { value: "LocalBusiness", label: "LocalBusiness (General)" },
        { value: "Restaurant", label: "Restaurant" },
        { value: "Store", label: "Store / Retail" },
        { value: "MedicalBusiness", label: "MedicalBusiness" },
        { value: "LegalService", label: "LegalService" },
        { value: "FinancialService", label: "FinancialService" },
        { value: "RealEstateAgent", label: "RealEstateAgent" },
        { value: "AutomotiveBusiness", label: "AutomotiveBusiness" },
        { value: "HealthAndBeautyBusiness", label: "HealthAndBeautyBusiness" },
        { value: "HomeAndConstructionBusiness", label: "HomeAndConstructionBusiness" },
      ],
      required: ["name", "streetAddress", "addressLocality", "addressCountry"],
      fields: [
        { key: "name", label: "Business Name", type: "text", required: true, placeholder: "e.g. Harbor Dental & Wellness Clinic" },
        { key: "description", label: "Business Description", type: "textarea", placeholder: "Describe your local business services and specialty." },
        { key: "url", label: "Business Website URL", type: "url", placeholder: "https://www.example.com/" },
        { key: "logo", label: "Logo URL", type: "url", placeholder: "https://www.example.com/logo.png" },
        { key: "image", label: "Storefront / Business Image URL", type: "url", placeholder: "https://www.example.com/storefront.jpg" },
        { key: "telephone", label: "Telephone", type: "tel", placeholder: "+91-22-4890-6200" },
        { key: "email", label: "Email", type: "email", placeholder: "hello@example.com" },
        { key: "priceRange", label: "Price Range", type: "select", options: ["", "$", "$$", "$$$", "$$$$"] },
        { key: "category", label: "Business Category", type: "text", placeholder: "e.g. Corporate Law Firm or Specialty Coffee Shop" },
        { section: "Physical Location & Coordinates" },
        { key: "streetAddress", label: "Street Address", type: "text", required: true, placeholder: "14 Linking Road, Bandra West" },
        { key: "addressLocality", label: "City", type: "text", required: true, placeholder: "Mumbai" },
        { key: "addressRegion", label: "State / Region", type: "text", placeholder: "Maharashtra" },
        { key: "postalCode", label: "Postal Code", type: "text", placeholder: "400050" },
        { key: "addressCountry", label: "Country Code", type: "text", required: true, placeholder: "IN" },
        { key: "latitude", label: "Latitude (Optional)", type: "number", step: "any", placeholder: "19.0596" },
        { key: "longitude", label: "Longitude (Optional)", type: "number", step: "any", placeholder: "72.8295" },
      ],
      repeatables: ["openingHours", "socialProfiles"],
    },
    {
      id: "Product",
      label: "Product",
      keywords: "product ecommerce item offer price sku gtin brand shop",
      required: ["name"],
      fields: [
        { key: "name", label: "Product Name", type: "text", required: true, placeholder: "e.g. Ergonomic Standing Desk Pro" },
        { key: "description", label: "Product Description", type: "textarea", placeholder: "Key features, materials, and specifications." },
        { key: "image", label: "Product Image URL", type: "url", placeholder: "https://www.example.com/products/desk.jpg" },
        { key: "brand", label: "Brand", type: "text", placeholder: "e.g. StudioCraft" },
        { key: "sku", label: "SKU", type: "text", placeholder: "SC-DESK-001" },
        { key: "mpn", label: "MPN (Manufacturer Part Number)", type: "text", placeholder: "MPN-9942" },
        { key: "gtin", label: "GTIN / EAN / UPC (Optional)", type: "text", placeholder: "0123456789012" },
        { key: "url", label: "Product Page URL", type: "url", placeholder: "https://www.example.com/products/desk" },
        { section: "Offer & Pricing (Generated only when Price & Currency are provided)" },
        { key: "price", label: "Price", type: "number", step: "0.01", min: "0", placeholder: "24999.00" },
        { key: "priceCurrency", label: "Currency", type: "select", options: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"] },
        {
          key: "availability",
          label: "Availability",
          type: "select",
          options: [
            "https://schema.org/InStock",
            "https://schema.org/OutOfStock",
            "https://schema.org/PreOrder",
            "https://schema.org/BackOrder",
            "https://schema.org/LimitedAvailability",
          ],
        },
        {
          key: "itemCondition",
          label: "Item Condition",
          type: "select",
          options: [
            "",
            "https://schema.org/NewCondition",
            "https://schema.org/UsedCondition",
            "https://schema.org/RefurbishedCondition",
            "https://schema.org/DamagedCondition",
          ],
        },
        { key: "sellerName", label: "Seller Name (Optional)", type: "text", placeholder: "e.g. StudioCraft Official Store" },
        { key: "sellerUrl", label: "Seller URL (Optional)", type: "url", placeholder: "https://www.example.com/" },
        { key: "priceValidUntil", label: "Price Valid Until (Optional)", type: "date" },
        { key: "shippingRate", label: "Shipping Cost (Optional)", type: "number", step: "0.01", min: "0", placeholder: "0.00" },
        { key: "shippingCountry", label: "Shipping Country Code (Optional)", type: "text", placeholder: "IN" },
        { key: "returnDays", label: "Return Window in Days (Optional)", type: "number", min: "0", step: "1", placeholder: "14" },
      ],
      repeatables: [],
    },
    {
      id: "Article",
      label: "Article",
      keywords: "article blog post news editorial author publisher headline",
      subtypes: [
        { value: "Article", label: "Article (General)" },
        { value: "BlogPosting", label: "BlogPosting" },
        { value: "NewsArticle", label: "NewsArticle" },
      ],
      required: ["headline", "authorName", "datePublished"],
      fields: [
        { key: "headline", label: "Article Headline", type: "text", required: true, placeholder: "e.g. How Browser-Based PDF Signing Protects Confidential Contracts" },
        { key: "description", label: "Article Summary / Description", type: "textarea", placeholder: "Concise summary of the article." },
        { key: "url", label: "Article URL", type: "url", placeholder: "https://www.example.com/blog/pdf-security" },
        { key: "image", label: "Featured Image URL", type: "url", placeholder: "https://www.example.com/blog/cover.jpg" },
        { key: "datePublished", label: "Date Published", type: "date", required: true },
        { key: "dateModified", label: "Date Modified", type: "date" },
        { key: "articleSection", label: "Article Section / Category", type: "text", placeholder: "e.g. Security & Compliance" },
        { key: "keywords", label: "Keywords (comma-separated)", type: "text", placeholder: "e-signature, document security, PDF" },
        { section: "Author & Publisher" },
        { key: "authorName", label: "Author Name", type: "text", required: true, placeholder: "e.g. Ananya Verma" },
        { key: "authorUrl", label: "Author Profile URL (Optional)", type: "url", placeholder: "https://www.example.com/authors/ananya" },
        { key: "publisherName", label: "Publisher Name", type: "text", placeholder: "e.g. Open Sign" },
        { key: "publisherLogo", label: "Publisher Logo URL", type: "url", placeholder: "https://www.opensign.in/assets/open%20sign%20logo.png" },
      ],
      repeatables: [],
    },
    {
      id: "FAQPage",
      label: "FAQPage",
      keywords: "faq frequently asked questions question answer accordion",
      required: [],
      notice: "Google currently limits FAQ rich results primarily to authoritative government and health websites. Valid FAQPage JSON-LD still helps structure Q&A content cleanly for search engines and AI systems.",
      fields: [
        { key: "url", label: "FAQ Page URL (Optional)", type: "url", placeholder: "https://www.example.com/faq" },
      ],
      repeatables: ["faqs"],
    },
    {
      id: "BreadcrumbList",
      label: "BreadcrumbList",
      keywords: "breadcrumb navigation trail path hierarchy category",
      required: [],
      fields: [],
      repeatables: ["breadcrumbs"],
    },
    {
      id: "Event",
      label: "Event",
      keywords: "event webinar conference workshop concert schedule tickets location",
      required: ["name", "startDate"],
      fields: [
        { key: "name", label: "Event Name", type: "text", required: true, placeholder: "e.g. Digital Transformation & Legal Tech Summit 2026" },
        { key: "description", label: "Event Description", type: "textarea", placeholder: "Overview of speakers, agenda, and audience." },
        { key: "startDate", label: "Start Date & Time", type: "datetime-local", required: true },
        { key: "endDate", label: "End Date & Time", type: "datetime-local" },
        {
          key: "eventAttendanceMode",
          label: "Attendance Mode",
          type: "select",
          options: [
            "https://schema.org/OfflineEventAttendanceMode",
            "https://schema.org/OnlineEventAttendanceMode",
            "https://schema.org/MixedEventAttendanceMode",
          ],
        },
        {
          key: "eventStatus",
          label: "Event Status",
          type: "select",
          options: [
            "https://schema.org/EventScheduled",
            "https://schema.org/EventPostponed",
            "https://schema.org/EventRescheduled",
            "https://schema.org/EventCancelled",
            "https://schema.org/EventMovedOnline",
          ],
        },
        { key: "image", label: "Event Banner Image URL", type: "url", placeholder: "https://www.example.com/events/summit.jpg" },
        { key: "url", label: "Event Page URL", type: "url", placeholder: "https://www.example.com/events/summit-2026" },
        { section: "Location (Venue and/or Online Stream)" },
        { key: "venueName", label: "Physical Venue Name", type: "text", placeholder: "e.g. Jio World Convention Centre" },
        { key: "venueStreet", label: "Venue Street Address", type: "text", placeholder: "Bandra Kurla Complex" },
        { key: "venueCity", label: "Venue City", type: "text", placeholder: "Mumbai" },
        { key: "venueCountry", label: "Venue Country Code", type: "text", placeholder: "IN" },
        { key: "virtualUrl", label: "Online Event / Stream URL", type: "url", placeholder: "https://www.example.com/events/live-stream" },
        { section: "Organizer & Ticket Offer (Optional)" },
        { key: "organizerName", label: "Organizer Name", type: "text", placeholder: "e.g. Open Sign Events" },
        { key: "organizerUrl", label: "Organizer URL", type: "url", placeholder: "https://www.opensign.in/" },
        { key: "ticketPrice", label: "Ticket Price", type: "number", step: "0.01", min: "0", placeholder: "0.00" },
        { key: "ticketCurrency", label: "Ticket Currency", type: "select", options: ["INR", "USD", "EUR", "GBP", "AED", "SGD"] },
        { key: "ticketUrl", label: "Ticket Registration URL", type: "url", placeholder: "https://www.example.com/events/register" },
      ],
      repeatables: [],
    },
    {
      id: "Person",
      label: "Person",
      keywords: "person author founder speaker bio profile job title alumni",
      required: ["name"],
      fields: [
        { key: "name", label: "Full Name", type: "text", required: true, placeholder: "e.g. Rishabh Pandey" },
        { key: "jobTitle", label: "Job Title / Role", type: "text", placeholder: "e.g. Founder & Product Architect" },
        { key: "description", label: "Short Biography", type: "textarea", placeholder: "Professional background and areas of expertise." },
        { key: "image", label: "Profile Photo URL", type: "url", placeholder: "https://www.example.com/team/profile.jpg" },
        { key: "url", label: "Personal Website / Profile URL", type: "url", placeholder: "https://www.example.com/about" },
        { key: "email", label: "Email (Optional)", type: "email", placeholder: "name@example.com" },
        { key: "telephone", label: "Telephone (Optional)", type: "tel", placeholder: "+91-98765-43210" },
        { key: "worksFor", label: "Organization Affiliation (worksFor)", type: "text", placeholder: "e.g. Open Sign" },
        { key: "alumniOf", label: "Alumni Of (Optional)", type: "text", placeholder: "e.g. University of Mumbai" },
      ],
      repeatables: ["socialProfiles"],
    },
    {
      id: "WebSite",
      label: "WebSite",
      keywords: "website domain site search sitelinks publisher",
      required: ["name", "url"],
      fields: [
        { key: "name", label: "Website Name", type: "text", required: true, placeholder: "e.g. Open Sign" },
        { key: "alternateName", label: "Alternate Website Name (Optional)", type: "text", placeholder: "e.g. OpenSign" },
        { key: "url", label: "Website URL", type: "url", required: true, placeholder: "https://www.opensign.in/" },
        { key: "description", label: "Website Description", type: "textarea", placeholder: "Describe the purpose of your website." },
        { key: "publisherName", label: "Publisher / Owner Name", type: "text", placeholder: "e.g. Open Sign" },
        { key: "inLanguage", label: "Language Code", type: "text", placeholder: "en" },
        { section: "Optional Site Search Action (Only if your site has a live search endpoint)" },
        { key: "searchTarget", label: "Search URL Template (must contain {search_term_string})", type: "text", placeholder: "https://www.example.com/search?q={search_term_string}" },
      ],
      repeatables: [],
    },
    {
      id: "WebPage",
      label: "WebPage",
      keywords: "webpage page landing page canonical date published modified",
      required: ["name", "url"],
      fields: [
        { key: "name", label: "Page Name / Title", type: "text", required: true, placeholder: "e.g. Free Schema Markup Generator – Create JSON-LD Online" },
        { key: "url", label: "Page URL", type: "url", required: true, placeholder: "https://www.opensign.in/tools/schema-markup-generator/" },
        { key: "description", label: "Page Description", type: "textarea", placeholder: "Clear summary of this specific webpage." },
        { key: "inLanguage", label: "Language Code", type: "text", placeholder: "en" },
        { key: "primaryImageOfPage", label: "Featured Image URL", type: "url", placeholder: "https://www.opensign.in/assets/open%20sign%20logo.png" },
        { key: "websiteName", label: "Parent Website Name (isPartOf)", type: "text", placeholder: "e.g. Open Sign" },
        { key: "websiteUrl", label: "Parent Website URL (isPartOf)", type: "url", placeholder: "https://www.opensign.in/" },
        { key: "publisherName", label: "Publisher Name", type: "text", placeholder: "e.g. Open Sign" },
        { key: "datePublished", label: "Date Published", type: "date" },
        { key: "dateModified", label: "Date Modified", type: "date" },
      ],
      repeatables: [],
    },
    {
      id: "Recipe",
      label: "Recipe",
      keywords: "recipe cooking food ingredients instructions prep cook time calories",
      required: ["name"],
      fields: [
        { key: "name", label: "Recipe Name", type: "text", required: true, placeholder: "e.g. Classic Masala Chai" },
        { key: "description", label: "Recipe Description", type: "textarea", placeholder: "Aromatic Indian spiced tea brewed with fresh ginger and cardamom." },
        { key: "authorName", label: "Author Name", type: "text", placeholder: "e.g. Chef Meera Nair" },
        { key: "prepTimeMins", label: "Prep Time (minutes)", type: "number", min: "0", step: "1", placeholder: "5" },
        { key: "cookTimeMins", label: "Cook Time (minutes)", type: "number", min: "0", step: "1", placeholder: "10" },
        { key: "totalTimeMins", label: "Total Time (minutes, optional override)", type: "number", min: "0", step: "1", placeholder: "15" },
        { key: "recipeYield", label: "Recipe Yield / Servings", type: "text", placeholder: "e.g. 2 cups" },
        { key: "recipeCategory", label: "Recipe Category", type: "text", placeholder: "e.g. Beverage" },
        { key: "recipeCuisine", label: "Cuisine", type: "text", placeholder: "e.g. Indian" },
        { key: "calories", label: "Calories per Serving (Optional)", type: "text", placeholder: "e.g. 110 calories" },
        { section: "Genuine Aggregate Rating (Include ONLY if verified user reviews exist)" },
        { key: "ratingValue", label: "Average Rating Value (1–5, optional)", type: "number", min: "1", max: "5", step: "0.1", placeholder: "" },
        { key: "reviewCount", label: "Total Review Count (optional)", type: "number", min: "1", step: "1", placeholder: "" },
      ],
      repeatables: ["recipeImages", "ingredients", "instructions"],
    },
    {
      id: "VideoObject",
      label: "VideoObject",
      keywords: "video youtube embed thumbnail upload date duration",
      required: ["name", "description", "thumbnailUrl", "uploadDate"],
      fields: [
        { key: "name", label: "Video Title", type: "text", required: true, placeholder: "e.g. How to Sign a PDF Document in Your Browser" },
        { key: "description", label: "Video Description", type: "textarea", required: true, placeholder: "Summary of what viewers learn in this video." },
        { key: "thumbnailUrl", label: "Thumbnail Image URL", type: "url", required: true, placeholder: "https://www.example.com/videos/thumb.jpg" },
        { key: "uploadDate", label: "Upload Date", type: "date", required: true },
        { section: "Video Duration (Converted to ISO 8601 e.g. PT2M35S)" },
        { key: "durHours", label: "Hours", type: "number", min: "0", step: "1", placeholder: "0" },
        { key: "durMinutes", label: "Minutes", type: "number", min: "0", max: "59", step: "1", placeholder: "2" },
        { key: "durSeconds", label: "Seconds", type: "number", min: "0", max: "59", step: "1", placeholder: "35" },
        { section: "Video URLs" },
        { key: "url", label: "Watch Page URL", type: "url", placeholder: "https://www.example.com/videos/sign-pdf" },
        { key: "embedUrl", label: "Embed Player URL", type: "url", placeholder: "https://www.youtube.com/embed/exampleId" },
        { key: "contentUrl", label: "Direct Media File URL (Optional)", type: "url", placeholder: "https://www.example.com/media/video.mp4" },
      ],
      repeatables: [],
    },
  ];

  // Clearly marked [Sample] templates (loaded ONLY when user explicitly clicks a template button)
  const SAMPLE_TEMPLATES = {
    Organization: {
      type: "Organization",
      subtype: "Organization",
      values: {
        name: "[Sample] Acme Cloud Solutions",
        legalName: "[Sample] Acme Cloud Solutions Private Limited",
        url: "https://www.example.com/",
        logo: "https://www.example.com/assets/logo.png",
        description: "[Sample] Enterprise workflow automation and digital document software.",
        email: "contact@example.com",
        telephone: "+91-22-4000-1000",
        foundingDate: "2023-04-15",
        streetAddress: "101 Innovation Park",
        addressLocality: "Mumbai",
        addressRegion: "Maharashtra",
        postalCode: "400013",
        addressCountry: "IN",
      },
      socialProfiles: ["https://www.linkedin.com/company/example", "https://x.com/example"],
    },
    LocalBusiness: {
      type: "LocalBusiness",
      subtype: "LegalService",
      values: {
        name: "[Sample] Chambers & Co. Legal Advisors",
        description: "[Sample] Commercial contract advisory and corporate compliance practice.",
        url: "https://www.example.com/",
        logo: "https://www.example.com/logo.png",
        image: "https://www.example.com/office.jpg",
        telephone: "+91-22-4000-2000",
        email: "desk@example.com",
        priceRange: "$$",
        category: "Corporate Law Practice",
        streetAddress: "42 Nariman Point",
        addressLocality: "Mumbai",
        addressRegion: "Maharashtra",
        postalCode: "400021",
        addressCountry: "IN",
        latitude: "18.9256",
        longitude: "72.8242",
      },
      openingHours: ["Mo-Fr 09:30-18:30"],
      socialProfiles: ["https://www.linkedin.com/company/example"],
    },
    Product: {
      type: "Product",
      values: {
        name: "[Sample] ProStudio Wireless Mechanical Keyboard",
        description: "[Sample] Compact aluminum wireless mechanical keyboard with tactile switches.",
        image: "https://www.example.com/images/keyboard.jpg",
        brand: "ProStudio",
        sku: "PS-KB-84",
        mpn: "KB84-2026",
        url: "https://www.example.com/products/keyboard",
        price: "7499.00",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        sellerName: "ProStudio Direct",
        sellerUrl: "https://www.example.com/",
        priceValidUntil: "2026-12-31",
        shippingRate: "0",
        shippingCountry: "IN",
        returnDays: "14",
      },
    },
    Article: {
      type: "Article",
      subtype: "BlogPosting",
      values: {
        headline: "[Sample] Best Practices for Structuring JSON-LD on Modern Websites",
        description: "[Sample] A practical guide to implementing clean Schema.org JSON-LD markup.",
        url: "https://www.example.com/blog/json-ld-guide",
        image: "https://www.example.com/blog/json-ld-cover.jpg",
        datePublished: "2026-11-15",
        dateModified: "2026-11-27",
        articleSection: "Technical SEO",
        keywords: "Schema.org, JSON-LD, structured data",
        authorName: "[Sample] Priya Nair",
        authorUrl: "https://www.example.com/authors/priya",
        publisherName: "[Sample] Acme Insights",
        publisherLogo: "https://www.example.com/logo.png",
      },
    },
    FAQPage: {
      type: "FAQPage",
      values: {
        url: "https://www.example.com/faq",
      },
      faqs: [
        {
          question: "[Sample] What format does this generator export?",
          answer: "[Sample] It exports valid Schema.org JSON-LD markup ready for placement inside a script type=\"application/ld+json\" tag.",
        },
        {
          question: "[Sample] Is my structured data uploaded to a server?",
          answer: "[Sample] No. All schema generation and validation run locally inside your browser.",
        },
      ],
    },
    BreadcrumbList: {
      type: "BreadcrumbList",
      values: {},
      breadcrumbs: [
        { name: "Home", url: "https://www.example.com/" },
        { name: "SEO Tools", url: "https://www.example.com/tools/" },
        { name: "Schema Markup Generator", url: "https://www.example.com/tools/schema-markup-generator/" },
      ],
    },
  };

  // DOM References
  const searchInput = $("smSchemaSearch");
  const typeSelect = $("smSchemaSelect");
  const typePillsWrap = $("smTypePills");
  const subtypeWrap = $("smSubtypeWrap");
  const subtypeSelect = $("smSubtypeSelect");
  const templateBtns = Array.from(document.querySelectorAll("[data-template]"));
  const resetBtn = $("smResetBtn");
  const dynamicFormEl = $("smDynamicForm");

  // Advanced Settings
  const advIdInput = $("smAdvId");
  const advIncludeOrgCheck = $("smAdvIncludeOrg");
  const advOrgWrap = $("smAdvOrgWrap");
  const advOrgNameInput = $("smAdvOrgName");
  const advOrgUrlInput = $("smAdvOrgUrl");
  const customPropsListEl = $("smCustomPropsList");
  const addCustomPropBtn = $("smAddCustomPropBtn");

  // Right Column Validation & Output
  const jsonStatusEl = $("smJsonStatus");
  const schemaStatusEl = $("smSchemaStatus");
  const issuesListEl = $("smValIssues");
  const codeModeBtns = Array.from(document.querySelectorAll("[data-code-mode]"));
  const codeOutputEl = $("smCodeOutput");
  const copyBtn = $("smCopyBtn");
  const selectAllBtn = $("smSelectAllBtn");
  const downloadJsonBtn = $("smDownloadJsonBtn");
  const downloadHtmlBtn = $("smDownloadHtmlBtn");
  const clearOutBtn = $("smClearOutBtn");
  const fullscreenBtn = $("smFullscreenBtn");

  const fullDialog = $("smFullDialog");
  const fullDialogClose = $("smFullDialogClose");
  const fullCodeOutputEl = $("smFullCodeOutput");

  if (!typeSelect || !dynamicFormEl || !codeOutputEl) return;

  // Application State
  let currentTypeId = "Organization";
  let currentSubtype = "Organization";
  let fieldValues = {};
  let socialProfiles = [""];
  let openingHours = [""];
  let faqs = [
    { question: "", answer: "" },
    { question: "", answer: "" },
  ];
  let breadcrumbs = [
    { name: "", url: "" },
    { name: "", url: "" },
    { name: "", url: "" },
  ];
  let recipeImages = [""];
  let ingredients = ["", ""];
  let instructions = ["", ""];
  let customProps = []; // { key, value }
  let codeMode = "json"; // 'json' | 'html'
  let lastRawOutput = "";

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, kind) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- Utilities ---------- */
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function cleanStr(v) {
    return String(v || "").trim();
  }

  function isValidHttpUrl(raw) {
    const s = cleanStr(raw);
    if (!s) return false;
    try {
      const u = new URL(s);
      return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
    } catch (_) {
      return false;
    }
  }

  function isValidIsoDate(raw) {
    const s = cleanStr(raw);
    if (!s) return false;
    return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(s) && !Number.isNaN(Date.parse(s));
  }

  function minutesToIsoDuration(minsRaw) {
    const m = Math.floor(Number(minsRaw));
    if (!Number.isFinite(m) || m <= 0) return "";
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `PT${h > 0 ? `${h}H` : ""}${rem > 0 ? `${rem}M` : ""}`;
  }

  function hmsToIsoDuration(hRaw, mRaw, sRaw) {
    const h = Math.max(0, Math.floor(Number(hRaw) || 0));
    const m = Math.max(0, Math.floor(Number(mRaw) || 0));
    const s = Math.max(0, Math.floor(Number(sRaw) || 0));
    if (h === 0 && m === 0 && s === 0) return "";
    return `PT${h > 0 ? `${h}H` : ""}${m > 0 ? `${m}M` : ""}${s > 0 ? `${s}S` : ""}`;
  }

  function getSchemaConfig(id) {
    return SCHEMA_TYPES.find((t) => t.id === id) || SCHEMA_TYPES[0];
  }

  /* ---------- Initialize Searchable Selector & Pills ---------- */
  function initTypeSelector() {
    typeSelect.innerHTML = "";
    typePillsWrap.innerHTML = "";

    SCHEMA_TYPES.forEach((st) => {
      const opt = document.createElement("option");
      opt.value = st.id;
      opt.textContent = st.label;
      typeSelect.appendChild(opt);

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `sm-type-pill${st.id === currentTypeId ? " active" : ""}`;
      pill.dataset.typeId = st.id;
      pill.textContent = st.label;
      pill.addEventListener("click", () => selectSchemaType(st.id));
      typePillsWrap.appendChild(pill);
    });
  }

  function filterSchemaTypes(query) {
    const q = cleanStr(query).toLowerCase();
    let firstVisibleId = null;

    Array.from(typeSelect.options).forEach((opt) => {
      const cfg = getSchemaConfig(opt.value);
      const hay = `${cfg.label} ${cfg.keywords}`.toLowerCase();
      const match = !q || hay.includes(q);
      opt.hidden = !match;
      if (match && !firstVisibleId) firstVisibleId = cfg.id;
    });

    typePillsWrap.querySelectorAll(".sm-type-pill").forEach((pill) => {
      const cfg = getSchemaConfig(pill.dataset.typeId);
      const hay = `${cfg.label} ${cfg.keywords}`.toLowerCase();
      pill.hidden = Boolean(q && !hay.includes(q));
    });

    if (firstVisibleId && typeSelect.selectedOptions[0]?.hidden) {
      selectSchemaType(firstVisibleId);
    }
  }

  function selectSchemaType(typeId, preserveValues = false) {
    const cfg = getSchemaConfig(typeId);
    currentTypeId = cfg.id;
    typeSelect.value = cfg.id;

    typePillsWrap.querySelectorAll(".sm-type-pill").forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.typeId === cfg.id);
    });

    if (cfg.subtypes && cfg.subtypes.length) {
      subtypeWrap.hidden = false;
      subtypeSelect.innerHTML = "";
      cfg.subtypes.forEach((sub) => {
        const opt = document.createElement("option");
        opt.value = sub.value;
        opt.textContent = sub.label;
        subtypeSelect.appendChild(opt);
      });
      if (!preserveValues || !cfg.subtypes.some((s) => s.value === currentSubtype)) {
        currentSubtype = cfg.subtypes[0].value;
      }
      subtypeSelect.value = currentSubtype;
    } else {
      subtypeWrap.hidden = true;
      currentSubtype = cfg.id;
    }

    if (!preserveValues) {
      fieldValues = {};
    }

    renderDynamicForm();
    regenerateAndValidate();
  }

  /* ---------- Render Dynamic Form for Selected Schema Type ---------- */
  function renderDynamicForm() {
    const cfg = getSchemaConfig(currentTypeId);
    dynamicFormEl.innerHTML = "";

    if (cfg.notice) {
      const note = document.createElement("div");
      note.className = "sm-notice-box";
      note.textContent = cfg.notice;
      dynamicFormEl.appendChild(note);
    }

    let currentGrid = null;
    const flushGrid = () => {
      if (currentGrid) {
        dynamicFormEl.appendChild(currentGrid);
        currentGrid = null;
      }
    };

    for (const f of cfg.fields) {
      if (f.section) {
        flushGrid();
        const div = document.createElement("div");
        div.className = "sm-sub-divider";
        div.textContent = f.section;
        dynamicFormEl.appendChild(div);
        continue;
      }

      const fieldWrap = document.createElement("div");
      fieldWrap.className = "sm-field";

      const lbl = document.createElement("label");
      const inputId = `sm_f_${cfg.id}_${f.key}`;
      lbl.htmlFor = inputId;
      lbl.append(document.createTextNode(f.label));
      if (f.required) {
        const req = document.createElement("span");
        req.className = "sm-req-tag";
        req.textContent = "Required";
        lbl.appendChild(req);
      }

      let control;
      if (f.type === "textarea") {
        flushGrid();
        control = document.createElement("textarea");
        control.className = "sm-textarea";
        control.rows = 3;
      } else if (f.type === "select") {
        control = document.createElement("select");
        control.className = "sm-select";
        (f.options || []).forEach((optVal) => {
          const o = document.createElement("option");
          o.value = optVal;
          o.textContent = optVal ? optVal.replace("https://schema.org/", "") : "— Select —";
          control.appendChild(o);
        });
      } else {
        control = document.createElement("input");
        control.type = f.type || "text";
        control.className = "sm-input";
        if (f.step) control.step = f.step;
        if (f.min !== undefined) control.min = f.min;
        if (f.max !== undefined) control.max = f.max;
      }

      control.id = inputId;
      control.dataset.fieldKey = f.key;
      if (f.placeholder) control.placeholder = f.placeholder;
      if (fieldValues[f.key] !== undefined) {
        control.value = fieldValues[f.key];
      } else if (f.type === "select" && f.options?.length) {
        fieldValues[f.key] = f.options[0];
        control.value = f.options[0];
      }

      const msgEl = document.createElement("p");
      msgEl.className = "sm-field-msg";
      msgEl.id = `${inputId}_msg`;

      const handler = () => {
        fieldValues[f.key] = control.value;
        validateSingleFieldUI(f, control, msgEl);
        regenerateAndValidate();
      };
      control.addEventListener("input", handler);
      control.addEventListener("change", handler);

      fieldWrap.append(lbl, control, msgEl);

      if (f.type === "textarea") {
        dynamicFormEl.appendChild(fieldWrap);
      } else {
        if (!currentGrid) {
          currentGrid = document.createElement("div");
          currentGrid.className = "sm-grid-2";
        }
        currentGrid.appendChild(fieldWrap);
      }
    }
    flushGrid();

    // Render repeatable sections configured for this schema type
    for (const repKey of cfg.repeatables || []) {
      if (repKey === "socialProfiles") renderStringListRepeater("Social Media Profile URLs (sameAs)", socialProfiles, "https://www.linkedin.com/company/yourbrand", "Add Social URL");
      if (repKey === "openingHours") renderStringListRepeater("Opening Hours (Schema.org format e.g. Mo-Fr 09:00-18:00)", openingHours, "Mo-Fr 09:30-18:30", "Add Hours Row");
      if (repKey === "faqs") renderFaqRepeater();
      if (repKey === "breadcrumbs") renderBreadcrumbRepeater();
      if (repKey === "recipeImages") renderStringListRepeater("Recipe Image URLs", recipeImages, "https://www.example.com/images/recipe.jpg", "Add Image URL");
      if (repKey === "ingredients") renderStringListRepeater("Ingredients", ingredients, "e.g. 2 cups water", "Add Ingredient");
      if (repKey === "instructions") renderStringListRepeater("Instruction Steps (HowToStep)", instructions, "e.g. Bring water and crushed ginger to a gentle boil.", "Add Step");
    }
  }

  function validateSingleFieldUI(f, control, msgEl) {
    const val = cleanStr(control.value);
    if (!val) {
      control.classList.remove("is-invalid");
      msgEl.className = "sm-field-msg";
      msgEl.textContent = "";
      return;
    }
    if (f.type === "url" && !isValidHttpUrl(val)) {
      control.classList.add("is-invalid");
      msgEl.className = "sm-field-msg is-error";
      msgEl.textContent = "Enter a valid URL starting with https:// or http://";
      return;
    }
    if ((f.type === "date" || f.type === "datetime-local") && !isValidIsoDate(val)) {
      control.classList.add("is-invalid");
      msgEl.className = "sm-field-msg is-error";
      msgEl.textContent = "Enter a valid date/time.";
      return;
    }
    control.classList.remove("is-invalid");
    msgEl.className = "sm-field-msg";
    msgEl.textContent = "";
  }

  /* ---------- Repeatable Builders ---------- */
  function renderStringListRepeater(title, arrRef, placeholder, addBtnText) {
    const header = document.createElement("div");
    header.className = "sm-sub-divider";
    const span = document.createElement("span");
    span.textContent = title;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sm-mini-btn";
    addBtn.textContent = `+ ${addBtnText}`;
    addBtn.addEventListener("click", () => {
      arrRef.push("");
      renderDynamicForm();
      regenerateAndValidate();
    });
    header.append(span, addBtn);
    dynamicFormEl.appendChild(header);

    const list = document.createElement("div");
    list.className = "sm-repeat-list";

    arrRef.forEach((val, idx) => {
      const row = document.createElement("div");
      row.className = "sm-inline-row";

      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "sm-input";
      inp.placeholder = placeholder;
      inp.value = val;
      inp.addEventListener("input", () => {
        arrRef[idx] = inp.value;
        regenerateAndValidate();
      });

      const rem = document.createElement("button");
      rem.type = "button";
      rem.className = "sm-icon-mini danger";
      rem.title = "Remove item";
      rem.setAttribute("aria-label", `Remove item ${idx + 1}`);
      rem.textContent = "×";
      rem.disabled = arrRef.length <= 1;
      rem.addEventListener("click", () => {
        if (arrRef.length > 1) {
          arrRef.splice(idx, 1);
          renderDynamicForm();
          regenerateAndValidate();
        }
      });

      row.append(inp, rem);
      list.appendChild(row);
    });

    dynamicFormEl.appendChild(list);
  }

  function renderFaqRepeater() {
    const header = document.createElement("div");
    header.className = "sm-sub-divider";
    const span = document.createElement("span");
    span.textContent = "FAQ Questions & Answers";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sm-mini-btn";
    addBtn.textContent = "+ Add FAQ Question";
    addBtn.addEventListener("click", () => {
      faqs.push({ question: "", answer: "" });
      renderDynamicForm();
      regenerateAndValidate();
    });
    header.append(span, addBtn);
    dynamicFormEl.appendChild(header);

    const list = document.createElement("div");
    list.className = "sm-repeat-list";

    faqs.forEach((item, idx) => {
      const box = document.createElement("div");
      box.className = "sm-repeat-item";

      const head = document.createElement("div");
      head.className = "sm-repeat-head";
      const lbl = document.createElement("span");
      lbl.textContent = `Question #${idx + 1}`;

      const ctrls = document.createElement("div");
      ctrls.className = "sm-repeat-controls";

      const up = document.createElement("button");
      up.type = "button";
      up.className = "sm-icon-mini";
      up.textContent = "↑";
      up.title = "Move FAQ up";
      up.disabled = idx === 0;
      up.addEventListener("click", () => {
        [faqs[idx - 1], faqs[idx]] = [faqs[idx], faqs[idx - 1]];
        renderDynamicForm();
        regenerateAndValidate();
      });

      const down = document.createElement("button");
      down.type = "button";
      down.className = "sm-icon-mini";
      down.textContent = "↓";
      down.title = "Move FAQ down";
      down.disabled = idx === faqs.length - 1;
      down.addEventListener("click", () => {
        [faqs[idx + 1], faqs[idx]] = [faqs[idx], faqs[idx + 1]];
        renderDynamicForm();
        regenerateAndValidate();
      });

      const rem = document.createElement("button");
      rem.type = "button";
      rem.className = "sm-icon-mini danger";
      rem.textContent = "×";
      rem.title = "Remove FAQ";
      rem.disabled = faqs.length <= 1;
      rem.addEventListener("click", () => {
        if (faqs.length > 1) {
          faqs.splice(idx, 1);
          renderDynamicForm();
          regenerateAndValidate();
        }
      });

      ctrls.append(up, down, rem);
      head.append(lbl, ctrls);

      const qInp = document.createElement("input");
      qInp.type = "text";
      qInp.className = "sm-input";
      qInp.placeholder = "Enter question (e.g. How long does delivery take?)";
      qInp.value = item.question;
      qInp.addEventListener("input", () => {
        faqs[idx].question = qInp.value;
        regenerateAndValidate();
      });

      const aInp = document.createElement("textarea");
      aInp.className = "sm-textarea";
      aInp.rows = 2;
      aInp.placeholder = "Enter clear, factual answer...";
      aInp.value = item.answer;
      aInp.addEventListener("input", () => {
        faqs[idx].answer = aInp.value;
        regenerateAndValidate();
      });

      box.append(head, qInp, aInp);
      list.appendChild(box);
    });

    dynamicFormEl.appendChild(list);
  }

  function renderBreadcrumbRepeater() {
    const header = document.createElement("div");
    header.className = "sm-sub-divider";
    const span = document.createElement("span");
    span.textContent = "Breadcrumb Trail Items (Auto-numbered from Position 1)";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sm-mini-btn";
    addBtn.textContent = "+ Add Breadcrumb Level";
    addBtn.addEventListener("click", () => {
      breadcrumbs.push({ name: "", url: "" });
      renderDynamicForm();
      regenerateAndValidate();
    });
    header.append(span, addBtn);
    dynamicFormEl.appendChild(header);

    const list = document.createElement("div");
    list.className = "sm-repeat-list";
    const levelHints = ["Homepage", "Parent Category", "Current Page"];

    breadcrumbs.forEach((item, idx) => {
      const box = document.createElement("div");
      box.className = "sm-repeat-item";

      const head = document.createElement("div");
      head.className = "sm-repeat-head";
      const lbl = document.createElement("span");
      lbl.textContent = `Position ${idx + 1}${levelHints[idx] ? ` (${levelHints[idx]})` : ""}`;

      const ctrls = document.createElement("div");
      ctrls.className = "sm-repeat-controls";

      const up = document.createElement("button");
      up.type = "button";
      up.className = "sm-icon-mini";
      up.textContent = "↑";
      up.disabled = idx === 0;
      up.addEventListener("click", () => {
        [breadcrumbs[idx - 1], breadcrumbs[idx]] = [breadcrumbs[idx], breadcrumbs[idx - 1]];
        renderDynamicForm();
        regenerateAndValidate();
      });

      const down = document.createElement("button");
      down.type = "button";
      down.className = "sm-icon-mini";
      down.textContent = "↓";
      down.disabled = idx === breadcrumbs.length - 1;
      down.addEventListener("click", () => {
        [breadcrumbs[idx + 1], breadcrumbs[idx]] = [breadcrumbs[idx], breadcrumbs[idx + 1]];
        renderDynamicForm();
        regenerateAndValidate();
      });

      const rem = document.createElement("button");
      rem.type = "button";
      rem.className = "sm-icon-mini danger";
      rem.textContent = "×";
      rem.disabled = breadcrumbs.length <= 1;
      rem.addEventListener("click", () => {
        if (breadcrumbs.length > 1) {
          breadcrumbs.splice(idx, 1);
          renderDynamicForm();
          regenerateAndValidate();
        }
      });

      ctrls.append(up, down, rem);
      head.append(lbl, ctrls);

      const grid = document.createElement("div");
      grid.className = "sm-grid-2";

      const nameInp = document.createElement("input");
      nameInp.type = "text";
      nameInp.className = "sm-input";
      nameInp.placeholder = idx === 0 ? "e.g. Home" : idx === 1 ? "e.g. SEO Tools" : "e.g. Current Page";
      nameInp.value = item.name;
      nameInp.addEventListener("input", () => {
        breadcrumbs[idx].name = nameInp.value;
        regenerateAndValidate();
      });

      const urlInp = document.createElement("input");
      urlInp.type = "url";
      urlInp.className = "sm-input";
      urlInp.placeholder = "https://www.example.com/...";
      urlInp.value = item.url;
      urlInp.addEventListener("input", () => {
        breadcrumbs[idx].url = urlInp.value;
        regenerateAndValidate();
      });

      grid.append(nameInp, urlInp);
      box.append(head, grid);
      list.appendChild(box);
    });

    dynamicFormEl.appendChild(list);
  }

  /* ---------- Custom JSON-LD Properties Repeater (Advanced Settings) ---------- */
  function renderCustomPropsRepeater() {
    customPropsListEl.innerHTML = "";
    customProps.forEach((prop, idx) => {
      const row = document.createElement("div");
      row.className = "sm-inline-row";

      const keyInp = document.createElement("input");
      keyInp.type = "text";
      keyInp.className = "sm-input";
      keyInp.placeholder = "Property name (e.g. alternateName)";
      keyInp.value = prop.key;
      keyInp.addEventListener("input", () => {
        customProps[idx].key = keyInp.value;
        regenerateAndValidate();
      });

      const valInp = document.createElement("input");
      valInp.type = "text";
      valInp.className = "sm-input";
      valInp.placeholder = "Value or JSON literal";
      valInp.value = prop.value;
      valInp.addEventListener("input", () => {
        customProps[idx].value = valInp.value;
        regenerateAndValidate();
      });

      const rem = document.createElement("button");
      rem.type = "button";
      rem.className = "sm-icon-mini danger";
      rem.textContent = "×";
      rem.title = "Remove custom property";
      rem.addEventListener("click", () => {
        customProps.splice(idx, 1);
        renderCustomPropsRepeater();
        regenerateAndValidate();
      });

      row.append(keyInp, valInp, rem);
      customPropsListEl.appendChild(row);
    });
  }

  addCustomPropBtn?.addEventListener("click", () => {
    customProps.push({ key: "", value: "" });
    renderCustomPropsRepeater();
  });

  /* ---------- Build Schema.org JSON-LD Object & Run Dual Validation ---------- */
  function buildPostalAddress(street, city, region, postal, country) {
    const addr = { "@type": "PostalAddress" };
    if (cleanStr(street)) addr.streetAddress = cleanStr(street);
    if (cleanStr(city)) addr.addressLocality = cleanStr(city);
    if (cleanStr(region)) addr.addressRegion = cleanStr(region);
    if (cleanStr(postal)) addr.postalCode = cleanStr(postal);
    if (cleanStr(country)) addr.addressCountry = cleanStr(country);
    return Object.keys(addr).length > 1 ? addr : null;
  }

  function generateSchemaAndValidate() {
    const cfg = getSchemaConfig(currentTypeId);
    const v = fieldValues;
    const issues = []; // { level: 'error' | 'warn', text: string }

    const addIssue = (level, text) => {
      if (!issues.some((i) => i.text === text)) issues.push({ level, text });
    };

    const checkUrlField = (val, label) => {
      const s = cleanStr(val);
      if (s && !isValidHttpUrl(s)) {
        addIssue("error", `Invalid URL for ${label}: must start with https:// or http://`);
        return null;
      }
      return s || null;
    };

    const obj = {
      "@context": "https://schema.org",
      "@type": currentSubtype || cfg.id,
    };

    // Optional @id in Advanced Settings
    const advId = cleanStr(advIdInput?.value);
    if (advId) {
      obj["@id"] = advId;
    }

    // Check required scalar fields declared on schema config
    for (const reqKey of cfg.required || []) {
      if (!cleanStr(v[reqKey])) {
        const metaF = cfg.fields.find((x) => x.key === reqKey);
        addIssue("warn", `Missing required property: "${metaF ? metaF.label : reqKey}" (${reqKey}).`);
      }
    }

    const cleanSocials = () => {
      const validUrls = [];
      socialProfiles.forEach((raw, idx) => {
        const s = cleanStr(raw);
        if (!s) return;
        if (isValidHttpUrl(s)) validUrls.push(s);
        else addIssue("error", `Invalid social profile URL #${idx + 1}: "${s}".`);
      });
      return validUrls;
    };

    if (cfg.id === "Organization") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.legalName)) obj.legalName = cleanStr(v.legalName);
      const u = checkUrlField(v.url, "Website URL");
      if (u) obj.url = u;
      const logo = checkUrlField(v.logo, "Logo URL");
      if (logo) obj.logo = logo;
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      if (cleanStr(v.email)) obj.email = cleanStr(v.email);
      if (cleanStr(v.telephone)) obj.telephone = cleanStr(v.telephone);
      if (cleanStr(v.foundingDate)) {
        if (isValidIsoDate(v.foundingDate)) obj.foundingDate = cleanStr(v.foundingDate);
        else addIssue("error", "Invalid foundingDate format (expected YYYY-MM-DD).");
      }
      const addr = buildPostalAddress(v.streetAddress, v.addressLocality, v.addressRegion, v.postalCode, v.addressCountry);
      if (addr) obj.address = addr;
      const sameAs = cleanSocials();
      if (sameAs.length) obj.sameAs = sameAs;
    } else if (cfg.id === "LocalBusiness") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      const u = checkUrlField(v.url, "Business URL");
      if (u) obj.url = u;
      const logo = checkUrlField(v.logo, "Logo URL");
      if (logo) obj.logo = logo;
      const img = checkUrlField(v.image, "Business Image URL");
      if (img) obj.image = img;
      if (cleanStr(v.telephone)) obj.telephone = cleanStr(v.telephone);
      if (cleanStr(v.email)) obj.email = cleanStr(v.email);
      if (cleanStr(v.priceRange)) obj.priceRange = cleanStr(v.priceRange);
      if (cleanStr(v.category)) obj.additionalType = cleanStr(v.category);

      const addr = buildPostalAddress(v.streetAddress, v.addressLocality, v.addressRegion, v.postalCode, v.addressCountry);
      if (addr) obj.address = addr;

      const latStr = cleanStr(v.latitude);
      const lngStr = cleanStr(v.longitude);
      if (latStr || lngStr) {
        const lat = Number(latStr);
        const lng = Number(lngStr);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          obj.geo = { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
        } else {
          addIssue("error", "Invalid GeoCoordinates: Latitude (-90 to 90) and Longitude (-180 to 180) must both be valid numbers.");
        }
      }

      const hours = openingHours.map(cleanStr).filter(Boolean);
      if (hours.length) obj.openingHours = hours;

      const sameAs = cleanSocials();
      if (sameAs.length) obj.sameAs = sameAs;
    } else if (cfg.id === "Product") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      const img = checkUrlField(v.image, "Product Image URL");
      if (img) obj.image = img;
      if (cleanStr(v.brand)) obj.brand = { "@type": "Brand", name: cleanStr(v.brand) };
      if (cleanStr(v.sku)) obj.sku = cleanStr(v.sku);
      if (cleanStr(v.mpn)) obj.mpn = cleanStr(v.mpn);
      if (cleanStr(v.gtin)) obj.gtin = cleanStr(v.gtin);
      const prodUrl = checkUrlField(v.url, "Product URL");
      if (prodUrl) obj.url = prodUrl;

      // Only generate Offer when Price & Currency are genuinely provided
      const priceStr = cleanStr(v.price);
      if (priceStr) {
        const priceNum = Number(priceStr);
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          addIssue("error", "Invalid Offer price: must be a non-negative number.");
        } else {
          const offer = {
            "@type": "Offer",
            priceCurrency: cleanStr(v.priceCurrency) || "INR",
            price: priceNum,
          };
          if (cleanStr(v.availability)) offer.availability = cleanStr(v.availability);
          if (cleanStr(v.itemCondition)) offer.itemCondition = cleanStr(v.itemCondition);
          if (prodUrl) offer.url = prodUrl;

          if (cleanStr(v.priceValidUntil)) {
            if (isValidIsoDate(v.priceValidUntil)) offer.priceValidUntil = cleanStr(v.priceValidUntil);
            else addIssue("error", "Invalid priceValidUntil date.");
          }

          if (cleanStr(v.sellerName)) {
            const seller = { "@type": "Organization", name: cleanStr(v.sellerName) };
            const sUrl = checkUrlField(v.sellerUrl, "Seller URL");
            if (sUrl) seller.url = sUrl;
            offer.seller = seller;
          }

          const shipRateStr = cleanStr(v.shippingRate);
          if (shipRateStr) {
            const shipNum = Number(shipRateStr);
            if (Number.isFinite(shipNum) && shipNum >= 0) {
              const ship = {
                "@type": "OfferShippingDetails",
                shippingRate: {
                  "@type": "MonetaryAmount",
                  value: shipNum,
                  currency: cleanStr(v.priceCurrency) || "INR",
                },
              };
              if (cleanStr(v.shippingCountry)) {
                ship.shippingDestination = { "@type": "DefinedRegion", addressCountry: cleanStr(v.shippingCountry) };
              }
              offer.shippingDetails = ship;
            } else {
              addIssue("error", "Invalid shipping cost value.");
            }
          }

          const retDaysStr = cleanStr(v.returnDays);
          if (retDaysStr) {
            const rDays = Math.floor(Number(retDaysStr));
            if (Number.isFinite(rDays) && rDays >= 0) {
              offer.hasMerchantReturnPolicy = {
                "@type": "MerchantReturnPolicy",
                returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                merchantReturnDays: rDays,
              };
            }
          }

          obj.offers = offer;
        }
      } else {
        addIssue("warn", "Product Offer omitted: enter a Price to generate the Schema.org Offer block.");
      }
    } else if (cfg.id === "Article") {
      if (cleanStr(v.headline)) obj.headline = cleanStr(v.headline);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      const u = checkUrlField(v.url, "Article URL");
      if (u) obj.mainEntityOfPage = { "@type": "WebPage", "@id": u };
      const img = checkUrlField(v.image, "Featured Image URL");
      if (img) obj.image = img;
      if (cleanStr(v.datePublished)) {
        if (isValidIsoDate(v.datePublished)) obj.datePublished = cleanStr(v.datePublished);
        else addIssue("error", "Invalid datePublished format.");
      }
      if (cleanStr(v.dateModified)) {
        if (isValidIsoDate(v.dateModified)) obj.dateModified = cleanStr(v.dateModified);
        else addIssue("error", "Invalid dateModified format.");
      }
      if (cleanStr(v.articleSection)) obj.articleSection = cleanStr(v.articleSection);
      if (cleanStr(v.keywords)) {
        const kw = v.keywords.split(",").map(cleanStr).filter(Boolean);
        if (kw.length) obj.keywords = kw;
      }
      if (cleanStr(v.authorName)) {
        const author = { "@type": "Person", name: cleanStr(v.authorName) };
        const aUrl = checkUrlField(v.authorUrl, "Author URL");
        if (aUrl) author.url = aUrl;
        obj.author = author;
      }
      if (cleanStr(v.publisherName)) {
        const pub = { "@type": "Organization", name: cleanStr(v.publisherName) };
        const pLogo = checkUrlField(v.publisherLogo, "Publisher Logo URL");
        if (pLogo) pub.logo = { "@type": "ImageObject", url: pLogo };
        obj.publisher = pub;
      }
    } else if (cfg.id === "FAQPage") {
      const u = checkUrlField(v.url, "FAQ Page URL");
      if (u) obj.url = u;

      const mainEntity = [];
      faqs.forEach((item, idx) => {
        const q = cleanStr(item.question);
        const a = cleanStr(item.answer);
        if (q && a) {
          mainEntity.push({
            "@type": "Question",
            name: q,
            acceptedAnswer: {
              "@type": "Answer",
              text: a,
            },
          });
        } else if (q || a) {
          addIssue("warn", `FAQ #${idx + 1} is incomplete: both Question and Answer are required.`);
        }
      });

      if (mainEntity.length) {
        obj.mainEntity = mainEntity;
      } else {
        addIssue("warn", "FAQPage requires at least one complete Question and Answer pair.");
      }
    } else if (cfg.id === "BreadcrumbList") {
      const itemListElement = [];
      breadcrumbs.forEach((item, idx) => {
        const nm = cleanStr(item.name);
        const rawU = cleanStr(item.url);
        if (!nm && !rawU) return;
        if (!nm) {
          addIssue("warn", `Breadcrumb item #${idx + 1} is missing a label name.`);
          return;
        }
        const entry = {
          "@type": "ListItem",
          position: itemListElement.length + 1,
          name: nm,
        };
        if (rawU) {
          if (isValidHttpUrl(rawU)) entry.item = rawU;
          else addIssue("error", `Invalid URL on Breadcrumb #${idx + 1}: "${rawU}".`);
        }
        itemListElement.push(entry);
      });

      if (itemListElement.length) {
        obj.itemListElement = itemListElement;
      } else {
        addIssue("warn", "BreadcrumbList requires at least one named breadcrumb item.");
      }
    } else if (cfg.id === "Event") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      if (cleanStr(v.startDate)) {
        if (isValidIsoDate(v.startDate)) obj.startDate = cleanStr(v.startDate);
        else addIssue("error", "Invalid Event startDate.");
      }
      if (cleanStr(v.endDate)) {
        if (isValidIsoDate(v.endDate)) obj.endDate = cleanStr(v.endDate);
        else addIssue("error", "Invalid Event endDate.");
      }
      const mode = cleanStr(v.eventAttendanceMode);
      if (mode) obj.eventAttendanceMode = mode;
      if (cleanStr(v.eventStatus)) obj.eventStatus = cleanStr(v.eventStatus);
      const img = checkUrlField(v.image, "Event Image URL");
      if (img) obj.image = img;
      const evUrl = checkUrlField(v.url, "Event URL");
      if (evUrl) obj.url = evUrl;

      // Build Location based on Offline / Online / Mixed mode
      const locations = [];
      const hasPhysical = cleanStr(v.venueName) || cleanStr(v.venueStreet) || cleanStr(v.venueCity);
      if (hasPhysical) {
        const place = { "@type": "Place" };
        if (cleanStr(v.venueName)) place.name = cleanStr(v.venueName);
        const addr = buildPostalAddress(v.venueStreet, v.venueCity, "", "", v.venueCountry);
        if (addr) place.address = addr;
        locations.push(place);
      }
      const vUrl = checkUrlField(v.virtualUrl, "Online Event Stream URL");
      if (vUrl) {
        locations.push({ "@type": "VirtualLocation", url: vUrl });
      }
      if (locations.length === 1) obj.location = locations[0];
      else if (locations.length > 1) obj.location = locations;
      else addIssue("warn", "Event location is recommended (add a physical venue and/or online stream URL).");

      if (cleanStr(v.organizerName)) {
        const org = { "@type": "Organization", name: cleanStr(v.organizerName) };
        const oUrl = checkUrlField(v.organizerUrl, "Organizer URL");
        if (oUrl) org.url = oUrl;
        obj.organizer = org;
      }

      if (cleanStr(v.ticketPrice)) {
        const tp = Number(v.ticketPrice);
        if (Number.isFinite(tp) && tp >= 0) {
          const offer = {
            "@type": "Offer",
            price: tp,
            priceCurrency: cleanStr(v.ticketCurrency) || "INR",
            availability: "https://schema.org/InStock",
          };
          const tUrl = checkUrlField(v.ticketUrl, "Ticket URL");
          if (tUrl) offer.url = tUrl;
          obj.offers = offer;
        } else {
          addIssue("error", "Invalid ticket price.");
        }
      }
    } else if (cfg.id === "Person") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.jobTitle)) obj.jobTitle = cleanStr(v.jobTitle);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      const img = checkUrlField(v.image, "Profile Photo URL");
      if (img) obj.image = img;
      const u = checkUrlField(v.url, "Personal Website URL");
      if (u) obj.url = u;
      if (cleanStr(v.email)) obj.email = cleanStr(v.email);
      if (cleanStr(v.telephone)) obj.telephone = cleanStr(v.telephone);
      if (cleanStr(v.worksFor)) obj.worksFor = { "@type": "Organization", name: cleanStr(v.worksFor) };
      if (cleanStr(v.alumniOf)) obj.alumniOf = { "@type": "EducationalOrganization", name: cleanStr(v.alumniOf) };
      const sameAs = cleanSocials();
      if (sameAs.length) obj.sameAs = sameAs;
    } else if (cfg.id === "WebSite") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.alternateName)) obj.alternateName = cleanStr(v.alternateName);
      const u = checkUrlField(v.url, "Website URL");
      if (u) obj.url = u;
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      if (cleanStr(v.publisherName)) obj.publisher = { "@type": "Organization", name: cleanStr(v.publisherName) };
      if (cleanStr(v.inLanguage)) obj.inLanguage = cleanStr(v.inLanguage);

      const target = cleanStr(v.searchTarget);
      if (target) {
        if (target.includes("{search_term_string}") && isValidHttpUrl(target.replace("{search_term_string}", "test"))) {
          obj.potentialAction = {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: target,
            },
            "query-input": "required name=search_term_string",
          };
        } else {
          addIssue("error", "SearchAction target must be a valid http(s) URL containing {search_term_string}.");
        }
      }
    } else if (cfg.id === "WebPage") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      const u = checkUrlField(v.url, "Page URL");
      if (u) obj.url = u;
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      if (cleanStr(v.inLanguage)) obj.inLanguage = cleanStr(v.inLanguage);
      const img = checkUrlField(v.primaryImageOfPage, "Featured Image URL");
      if (img) obj.primaryImageOfPage = { "@type": "ImageObject", url: img };
      if (cleanStr(v.websiteName) || cleanStr(v.websiteUrl)) {
        const part = { "@type": "WebSite" };
        if (cleanStr(v.websiteName)) part.name = cleanStr(v.websiteName);
        const wUrl = checkUrlField(v.websiteUrl, "Parent Website URL");
        if (wUrl) part.url = wUrl;
        if (Object.keys(part).length > 1) obj.isPartOf = part;
      }
      if (cleanStr(v.publisherName)) obj.publisher = { "@type": "Organization", name: cleanStr(v.publisherName) };
      if (cleanStr(v.datePublished)) {
        if (isValidIsoDate(v.datePublished)) obj.datePublished = cleanStr(v.datePublished);
        else addIssue("error", "Invalid datePublished.");
      }
      if (cleanStr(v.dateModified)) {
        if (isValidIsoDate(v.dateModified)) obj.dateModified = cleanStr(v.dateModified);
        else addIssue("error", "Invalid dateModified.");
      }
    } else if (cfg.id === "Recipe") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);

      const imgs = [];
      recipeImages.forEach((raw, idx) => {
        const s = cleanStr(raw);
        if (!s) return;
        if (isValidHttpUrl(s)) imgs.push(s);
        else addIssue("error", `Invalid Recipe image URL #${idx + 1}.`);
      });
      if (imgs.length === 1) obj.image = imgs[0];
      else if (imgs.length > 1) obj.image = imgs;

      if (cleanStr(v.authorName)) obj.author = { "@type": "Person", name: cleanStr(v.authorName) };
      const prepIso = minutesToIsoDuration(v.prepTimeMins);
      if (prepIso) obj.prepTime = prepIso;
      const cookIso = minutesToIsoDuration(v.cookTimeMins);
      if (cookIso) obj.cookTime = cookIso;
      const totIso = minutesToIsoDuration(v.totalTimeMins) || minutesToIsoDuration((Number(v.prepTimeMins) || 0) + (Number(v.cookTimeMins) || 0));
      if (totIso) obj.totalTime = totIso;

      if (cleanStr(v.recipeYield)) obj.recipeYield = cleanStr(v.recipeYield);
      if (cleanStr(v.recipeCategory)) obj.recipeCategory = cleanStr(v.recipeCategory);
      if (cleanStr(v.recipeCuisine)) obj.recipeCuisine = cleanStr(v.recipeCuisine);

      const ingList = ingredients.map(cleanStr).filter(Boolean);
      if (ingList.length) obj.recipeIngredient = ingList;
      else addIssue("warn", "Add at least one ingredient to recipeIngredient.");

      const stepList = instructions
        .map(cleanStr)
        .filter(Boolean)
        .map((txt) => ({ "@type": "HowToStep", text: txt }));
      if (stepList.length) obj.recipeInstructions = stepList;
      else addIssue("warn", "Add at least one instruction step to recipeInstructions.");

      if (cleanStr(v.calories)) {
        obj.nutrition = { "@type": "NutritionInformation", calories: cleanStr(v.calories) };
      }

      // Only include AggregateRating when both ratingValue and reviewCount are genuinely provided
      const rValStr = cleanStr(v.ratingValue);
      const rCntStr = cleanStr(v.reviewCount);
      if (rValStr || rCntStr) {
        const rv = Number(rValStr);
        const rc = Math.floor(Number(rCntStr));
        if (Number.isFinite(rv) && rv >= 1 && rv <= 5 && Number.isFinite(rc) && rc >= 1) {
          obj.aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: rv,
            reviewCount: rc,
          };
        } else {
          addIssue("error", "AggregateRating requires both a valid rating (1–5) and a positive review count.");
        }
      }
    } else if (cfg.id === "VideoObject") {
      if (cleanStr(v.name)) obj.name = cleanStr(v.name);
      if (cleanStr(v.description)) obj.description = cleanStr(v.description);
      const thumb = checkUrlField(v.thumbnailUrl, "Thumbnail URL");
      if (thumb) obj.thumbnailUrl = thumb;
      if (cleanStr(v.uploadDate)) {
        if (isValidIsoDate(v.uploadDate)) obj.uploadDate = cleanStr(v.uploadDate);
        else addIssue("error", "Invalid uploadDate.");
      }
      const dur = hmsToIsoDuration(v.durHours, v.durMinutes, v.durSeconds);
      if (dur) obj.duration = dur;
      const watchU = checkUrlField(v.url, "Watch URL");
      if (watchU) obj.url = watchU;
      const embU = checkUrlField(v.embedUrl, "Embed URL");
      if (embU) obj.embedUrl = embU;
      const cntU = checkUrlField(v.contentUrl, "Content URL");
      if (cntU) obj.contentUrl = cntU;
    }

    // Optional Advanced Organization / Publisher reference
    if (advIncludeOrgCheck?.checked && cfg.id !== "Organization" && cfg.id !== "LocalBusiness") {
      const oName = cleanStr(advOrgNameInput?.value);
      if (oName) {
        const orgRef = { "@type": "Organization", name: oName };
        const oUrl = checkUrlField(advOrgUrlInput?.value, "Advanced Organization URL");
        if (oUrl) orgRef.url = oUrl;
        obj.sourceOrganization = orgRef;
      }
    }

    // Optional Validated Custom JSON-LD Properties
    customProps.forEach((cp, idx) => {
      const k = cleanStr(cp.key);
      const rawVal = cleanStr(cp.value);
      if (!k && !rawVal) return;
      if (!k || !/^[a-zA-Z@_][a-zA-Z0-9_:-]*$/.test(k)) {
        addIssue("error", `Invalid custom property key #${idx + 1}: "${k}".`);
        return;
      }
      if (k === "@context" || k === "@type") {
        addIssue("error", `Custom property cannot overwrite "${k}".`);
        return;
      }
      if (!rawVal) {
        addIssue("warn", `Custom property "${k}" has an empty value and was skipped.`);
        return;
      }
      // Parse valid JSON literal (number, boolean, array, object) or treat safely as string
      if (/^(true|false|-?\d+(\.\d+)?|\{.*\}|\[.*\])$/.test(rawVal)) {
        try {
          obj[k] = JSON.parse(rawVal);
        } catch (_) {
          obj[k] = rawVal;
        }
      } else {
        obj[k] = rawVal;
      }
    });

    // Serialize formatted JSON & run independent JSON syntax validation
    const jsonString = JSON.stringify(obj, null, 2);
    let jsonValid = false;
    try {
      const reparsed = JSON.parse(jsonString);
      jsonValid = Boolean(reparsed && reparsed["@context"] === "https://schema.org" && reparsed["@type"]);
    } catch (_) {
      jsonValid = false;
    }

    return { obj, jsonString, jsonValid, issues };
  }

  /* ---------- Safe HTML Script Wrapper ---------- */
  function wrapAsHtmlScript(jsonString) {
    // Prevent premature </script> breakout inside JSON strings
    const safeJson = jsonString.replace(/<\/script/gi, "<\\/script");
    return `<script type="application/ld+json">\n${safeJson}\n</script>`;
  }

  /* ---------- Syntax Highlighter ---------- */
  function highlightJsonCode(rawText, isHtmlWrapped) {
    const escaped = escapeHtml(rawText);
    let highlighted = escaped.replace(
      /(&quot;(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&])*&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
      (match, strTok, colonTok, boolTok) => {
        if (strTok) {
          if (colonTok) {
            return `<span class="j-key">${strTok}</span><span class="j-punct">${colonTok}</span>`;
          }
          return `<span class="j-str">${strTok}</span>`;
        }
        if (boolTok) {
          return `<span class="j-bool">${boolTok}</span>`;
        }
        return `<span class="j-num">${match}</span>`;
      }
    );

    if (isHtmlWrapped) {
      highlighted = highlighted
        .replace(/^(&lt;script type=<span class="j-str">&quot;application\/ld\+json&quot;<\/span>&gt;)/, '<span class="j-tag">$1</span>')
        .replace(/(&lt;\/script&gt;)$/, '<span class="j-tag">$1</span>');
    }

    return highlighted;
  }

  /* ---------- Master Regenerate & Validation UI Update ---------- */
  function regenerateAndValidate() {
    const { jsonString, jsonValid, issues } = generateSchemaAndValidate();
    const isHtml = codeMode === "html";
    lastRawOutput = isHtml ? wrapAsHtmlScript(jsonString) : jsonString;

    const highlightedHtml = highlightJsonCode(lastRawOutput, isHtml);
    codeOutputEl.innerHTML = highlightedHtml;
    if (fullCodeOutputEl) fullCodeOutputEl.innerHTML = highlightedHtml;

    // 1. JSON Syntax Validation Status
    if (jsonStatusEl) {
      jsonStatusEl.textContent = jsonValid ? "Valid JSON" : "Invalid JSON";
      jsonStatusEl.dataset.state = jsonValid ? "ok" : "error";
    }

    // 2. Schema.org Vocabulary & Required Field Validation Status
    const hasError = issues.some((i) => i.level === "error");
    const hasWarn = issues.some((i) => i.level === "warn");
    if (schemaStatusEl) {
      if (hasError) {
        schemaStatusEl.textContent = "Invalid Property / URL";
        schemaStatusEl.dataset.state = "error";
      } else if (hasWarn) {
        schemaStatusEl.textContent = "Missing Required Information";
        schemaStatusEl.dataset.state = "warn";
      } else {
        schemaStatusEl.textContent = "Schema Generated";
        schemaStatusEl.dataset.state = "ok";
      }
    }

    if (issuesListEl) {
      issuesListEl.innerHTML = "";
      if (issues.length === 0) {
        issuesListEl.hidden = true;
      } else {
        issuesListEl.hidden = false;
        issues.forEach((iss) => {
          const li = document.createElement("li");
          if (iss.level === "error") li.className = "is-error";
          li.textContent = iss.text;
          issuesListEl.appendChild(li);
        });
      }
    }
  }

  /* ---------- Apply Example Templates ---------- */
  function applyTemplate(tplKey) {
    const tpl = SAMPLE_TEMPLATES[tplKey];
    if (!tpl) return;

    currentSubtype = tpl.subtype || tpl.type;
    fieldValues = { ...(tpl.values || {}) };

    if (tpl.socialProfiles) socialProfiles = [...tpl.socialProfiles];
    if (tpl.openingHours) openingHours = [...tpl.openingHours];
    if (tpl.faqs) faqs = tpl.faqs.map((x) => ({ ...x }));
    if (tpl.breadcrumbs) breadcrumbs = tpl.breadcrumbs.map((x) => ({ ...x }));

    selectSchemaType(tpl.type, true);
    toast(`Loaded [Sample] ${tpl.type} template.`);
  }

  /* ---------- Reset Everything ---------- */
  function resetAll() {
    if (searchInput) searchInput.value = "";
    filterSchemaTypes("");
    currentSubtype = "Organization";
    fieldValues = {};
    socialProfiles = [""];
    openingHours = [""];
    faqs = [
      { question: "", answer: "" },
      { question: "", answer: "" },
    ];
    breadcrumbs = [
      { name: "", url: "" },
      { name: "", url: "" },
      { name: "", url: "" },
    ];
    recipeImages = [""];
    ingredients = ["", ""];
    instructions = ["", ""];
    customProps = [];

    if (advIdInput) advIdInput.value = "";
    if (advIncludeOrgCheck) advIncludeOrgCheck.checked = false;
    if (advOrgWrap) advOrgWrap.hidden = true;
    if (advOrgNameInput) advOrgNameInput.value = "";
    if (advOrgUrlInput) advOrgUrlInput.value = "";
    renderCustomPropsRepeater();

    selectSchemaType("Organization", false);
    toast("Schema Markup Generator reset.");
  }

  /* ---------- Event Wiring ---------- */
  searchInput?.addEventListener("input", () => filterSchemaTypes(searchInput.value));
  typeSelect?.addEventListener("change", () => selectSchemaType(typeSelect.value, false));
  subtypeSelect?.addEventListener("change", () => {
    currentSubtype = subtypeSelect.value;
    regenerateAndValidate();
  });

  templateBtns.forEach((btn) => {
    btn.addEventListener("click", () => applyTemplate(btn.dataset.template));
  });

  resetBtn?.addEventListener("click", resetAll);
  clearOutBtn?.addEventListener("click", resetAll);

  advIdInput?.addEventListener("input", regenerateAndValidate);
  advIncludeOrgCheck?.addEventListener("change", () => {
    if (advOrgWrap) advOrgWrap.hidden = !advIncludeOrgCheck.checked;
    regenerateAndValidate();
  });
  advOrgNameInput?.addEventListener("input", regenerateAndValidate);
  advOrgUrlInput?.addEventListener("input", regenerateAndValidate);

  codeModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      codeMode = btn.dataset.codeMode || "json";
      codeModeBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      regenerateAndValidate();
    });
  });

  copyBtn?.addEventListener("click", async () => {
    if (!lastRawOutput) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(lastRawOutput);
      } else {
        const ta = document.createElement("textarea");
        ta.value = lastRawOutput;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      const orig = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      toast("Structured data copied to clipboard.");
      setTimeout(() => {
        copyBtn.textContent = orig;
      }, 1800);
    } catch (_) {
      toast("Unable to copy code.", "error");
    }
  });

  selectAllBtn?.addEventListener("click", () => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(codeOutputEl);
    sel.removeAllRanges();
    sel.addRange(range);
    toast("Selected all generated code.");
  });

  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content + "\n"], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Downloaded ${filename}`);
  }

  downloadJsonBtn?.addEventListener("click", () => {
    const { jsonString } = generateSchemaAndValidate();
    triggerDownload(jsonString, JSON_FILENAME, "application/ld+json;charset=utf-8");
  });

  downloadHtmlBtn?.addEventListener("click", () => {
    const { jsonString } = generateSchemaAndValidate();
    triggerDownload(wrapAsHtmlScript(jsonString), HTML_FILENAME, "text/html;charset=utf-8");
  });

  fullscreenBtn?.addEventListener("click", () => {
    if (fullDialog) fullDialog.showModal();
  });
  fullDialogClose?.addEventListener("click", () => fullDialog?.close());

  // Boot
  initTypeSelector();
  selectSchemaType("Organization", false);
})();
