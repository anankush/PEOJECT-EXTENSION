# Microsoft Edge Add-ons & Chrome Web Store Deployment Guide

এই ডকুমেন্টটি আপনার তৈরি করা **Solve AI** এক্সটেনশনটি Microsoft Edge Add-ons Store এবং Chrome Web Store-এ পাবলিশ করার জন্য একটি ধাপে ধাপে টেকনিক্যাল গাইড।

---

## ১. প্রমোশনাল এবং স্টোর অ্যাসেট রিকোয়ারমেন্ট (Asset Requirements)

স্টোরে সাবমিট করার আগে নিচের সাইজের আইকন এবং স্ক্রিনশটগুলো প্রস্তুত রাখুন:

### ক) এক্সটেনশন আইকনসমূহ (Extension Icons)
এক্সটেনশনের জিপ ফাইলের ভেতরে অবশ্যই আইকনগুলো সঠিক ডাইমেনশনে থাকতে হবে (যা আমরা ইতিমধ্যে `assets/` ফোল্ডারে যুক্ত করেছি):
- **16x16 pixels**: ব্রাউজারের ট্যাবে এবং ফ্লেক্স বারে দেখানোর জন্য (`logo-16.png`)।
- **48x48 pixels**: এক্সটেনশন ম্যানেজমেন্ট পেজে দেখানোর জন্য (`logo-48.png`)।
- **128x128 pixels**: স্টোরের প্রোডাক্ট ডিটেইলস পেজে এবং ইনস্টলেশনের সময় দেখানোর জন্য (`logo-128.png`)।
> *নোট: ব্রাউজারের অটো-স্কেলিংয়ের সুবিধার জন্য আমরা প্রাথমিক লোগো ফাইলটি কপি করে রেখেছি। প্রোডাকশনে পাবলিশ করার আগে এগুলোকে ইমেজ এডিটর (যেমন Photoshop বা Photopea) দিয়ে নির্দিষ্ট রেজোলিউশনে রিসাইজ করে নেওয়া রিকমেন্ডেড।*

### খ) স্টোর প্রমোশনাল ইমেজ (Edge / Chrome Store Requirements)
স্টোরের লিস্টিংয়ের জন্য আপনাকে কিছু প্রমোশনাল ব্যানার আপলোড করতে হবে:
- **Store Icon (1:1 Ratio)**: ৩০০x৩০০ পিক্সেল (Edge) অথবা ১২৮x১২৮ পিক্সেল (Chrome)।
- **Screenshots**: ন্যূনতম ১টি এবং সর্বোচ্চ ৫টি স্ক্রিনশট। সাইজ: **1280x800** অথবা **640x400** পিক্সেল। (এক্সটেনশনের সলভিং পেজ এবং চ্যাট ইন্টারফেসের স্ক্রিনশট ব্যবহার করবেন)।
- **Promotional Tiles (Optional but Recommended)**:
  - Small Tile: ৪৪০x২৮০ পিক্সেল।
  - Large Tile: ৯২০x৬৮০ পিক্সেল।

---

## ২. প্রাইভেসি পলিসি সেটআপ (Privacy Policy Setup)

Microsoft এবং Google উভয় স্টোরই পারসোনাল ডেটা (যেমন: API Key) হ্যান্ডেল করার কারণে একটি **Privacy Policy URL** দাবি করে।
- **করণীয়**: একটি ফ্রি প্রাইভেসি পলিসি জেনারেটর (যেমন [freeprivacypolicy.com](https://www.freeprivacypolicy.com/)) ব্যবহার করে একটি সিম্পল পলিসি তৈরি করুন। 
- পলিসিতে উল্লেখ করুন: *"Solve AI handles user API keys locally in the browser's storage (`chrome.storage.local`). No API keys, credentials, or personal browsing history are uploaded to our servers. Network requests are direct peer-to-peer connection to OpenAI and Gemini API endpoints."*
- এই পলিসিটি আপনার GitHub Repository-র `README` পেজে বা কোনো ফ্রি হোস্টিং সাইটে (যেমন GitHub Pages, Google Sites) আপলোড করে তার লিংকটি স্টোরে সাবমিট করুন।

---

## ৩. প্যাকেজিং সিস্টেম (Packaging & Zip Creation)

স্টোরে আপলোড করার জন্য পুরো এক্সটেনশন ফোল্ডারটিকে জিপ ফাইলে কনভার্ট করতে হবে।
1. `C:/xampp/htdocs/PROJECT EXTENSION/SOLVE AI` ফোল্ডারে যান।
2. নিচের ফাইল এবং ফোল্ডারগুলো সিলেক্ট করুন:
   - `manifest.json`
   - `popup.html`
   - `popup.js`
   - `popup.css`
   - `background.js`
   - `content.js`
   - `bypass.js`
   - `assets/` (যার ভেতরে লোগো আইকনগুলো রয়েছে)
3. রাইট ক্লিক করে **Send to -> Compressed (zipped) folder** এ ক্লিক করে `solve-ai-v2.0.zip` ফাইলটি তৈরি করুন।
> *সতর্কতা: জিপ ফাইলের ভেতরে সরাসরি ফাইলগুলো থাকতে হবে, কোনো অতিরিক্ত রুট ফোল্ডার (যেমন `SOLVE AI/manifest.json`) থাকা যাবে না।*

---

## ৪. Microsoft Edge Add-ons-এ পাবলিশ করার ধাপসমূহ

### ধাপ ১: পার্টনার সেন্টারে সাইন-আপ
1. [Microsoft Partner Center Developer Dashboard](https://partner.microsoft.com/dashboard/microsoftedge/public/login)-এ যান।
2. আপনার Microsoft Account দিয়ে লগইন করুন এবং ডেভেলপার অ্যাকাউন্ট রেজিস্টার করুন (Microsoft Edge-এর জন্য কোনো রেজিস্ট্রেশন ফি লাগে না, এটি সম্পূর্ণ ফ্রি!)।

### ধাপ ২: নতুন লিস্টিং তৈরি করুন
1. ড্যাশবোর্ড থেকে **Create new extension** বাটনে ক্লিক করুন।
2. আপনার তৈরি করা `solve-ai-v2.0.zip` ফাইলটি ড্র্যাগ অ্যান্ড ড্রপ করে আপলোড করুন।

### ধাপ ৩: ডিটেইলস ফিল-আপ (Store Properties)
- **Properties**: এক্সটেনশনের ক্যাটাগরি (যেমন: `Productivity` বা `Education`) সিলেক্ট করুন।
- **Availability**: এক্সটেনশনটি কোন কোন দেশে রিলিজ করতে চান তা সিলেক্ট করুন (ডিফল্ট: All countries)।

### ধাপ ৪: স্টোর লিস্টিং (Store Listing)
- **Description**: এক্সটেনশনটির কাজ এবং ফিচার সুন্দর করে বর্ণনা করুন (বাংলা ও ইংরেজি উভয় ল্যাঙ্গুয়েজ সাপোর্ট করতে পারেন)।
- **Icons & Screenshots**: আপনার তৈরি করা লোগো এবং স্ক্রিনশটগুলো আপলোড করুন।
- **Privacy Policy**: আপনার তৈরি করা প্রাইভেসি পলিসি লিংকটি পেস্ট করুন।

### ধাপ ৫: রিভিউ এবং সাবমিশন (Submission for Review)
1. **Publish** বাটনে ক্লিক করুন।
2. Microsoft টিম সাধারণত ১ থেকে ৩ কার্যদিবসের মধ্যে এক্সটেনশনটি রিভিউ করে লাইভ করে দেয়।

---

## ৫. Chrome Web Store-এ পাবলিশ করার ধাপসমূহ (ঐচ্ছিক কিন্তু একই জিপ দিয়ে সম্ভব)

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)-এ যান।
2. একটি Google Account দিয়ে সাইন-ইন করে ৫ ডলার ($5 USD) ওয়ান-টাইম ফি দিয়ে ডেভেলপার অ্যাকাউন্ট এক্টিভেট করুন।
3. **Add new item** বাটনে ক্লিক করে একই `solve-ai-v2.0.zip` ফাইলটি আপলোড করুন।
4. লিস্টিং ফর্ম পূরণ করুন, প্রাইভেসি পলিসি লিংক এড করুন এবং সাবমিট করুন। রিভিউ হতে সাধারণত ২৪ থেকে ৭২ ঘণ্টা সময় লাগে।
