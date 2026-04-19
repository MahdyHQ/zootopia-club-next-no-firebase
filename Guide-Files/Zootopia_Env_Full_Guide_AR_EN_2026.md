# Zootopia Club Environment Variables — Full Beginner Guide (Arabic + English)

> **Purpose / الهدف**
>
> This guide explains your current `.env.example` file in plain beginner language, grouped by feature, with examples, what each variable accepts, what happens when you change it, and how to generate the secrets/keys safely.
>
> هذا الدليل يشرح ملف `.env.example` الحالي **بالعربي والإنجليزي** بطريقة بسيطة جدًا للمبتدئ، مع تجميع المتغيرات حسب الوظيفة، وشرح نوع كل متغير، وما الذي يحدث عند تغييره، وكيفية توليد المفاتيح المطلوبة بشكل صحيح.

---

## 1) Super-short mental model | الخلاصة السريعة جدًا

### Arabic
عندك 3 أنواع رئيسية من المتغيرات:

1. **PUBLIC / Frontend**  
   تبدأ غالبًا بـ `NEXT_PUBLIC_`  
   هذه قد تصل للمتصفح، فلا تضع فيها أسرار.

2. **SERVER / Backend**  
   هذه للسيرفر فقط.  
   ضع فيها المفاتيح السرية والـ service keys وأي منطق حساس.

3. **MIXED / Runtime-crossing**  
   متغيرات تؤثر على السيرفر والواجهة أو على bootstrap / redirects / base URLs.

### English
You have 3 main kinds of env vars:

1. **PUBLIC / Frontend**  
   Usually starts with `NEXT_PUBLIC_`.  
   These may be exposed to the browser, so never put secrets here.

2. **SERVER / Backend**  
   Server-only.  
   Put secrets, service keys, and sensitive authority here.

3. **MIXED / Runtime-crossing**  
   Variables that affect both server behavior and UI/bootstrap/redirect logic.

---

## 2) Before you edit anything | قبل ما تغيّر أي حاجة

### Arabic
اعمل دائمًا الخطوات دي:

1. انسخ `.env.example` إلى `.env.local` في **جذر المشروع**.
2. لا تعدل `.env.example` إلا لو أنت تقصد تحديث التوثيق للمشروع.
3. لا ترفع `.env.local` إلى GitHub.
4. بعد تعديل أي env مهم، أعد تشغيل السيرفر المحلي.
5. لو غيّرت متغيرات تؤثر على البناء أو الـ `NEXT_PUBLIC_*` أو `next.config.ts`، غالبًا تحتاج:
   - restart محلي
   - وإعادة build/redeploy على البيئة الحقيقية

### English
Always do this:

1. Copy `.env.example` to `.env.local` in the **repo root**.
2. Only edit `.env.example` when you want to update project documentation/template.
3. Never commit `.env.local`.
4. Restart the local dev server after changing important env vars.
5. If you changed `NEXT_PUBLIC_*` vars or values read by `next.config.ts`, you usually need:
   - local restart
   - and production rebuild/redeploy

---

## 3) Fast setup workflow for a beginner | أسرع Workflow للمبتدئ

### Arabic
لو أنت لسه تبدأ:

1. جهّز Supabase project.
2. خذ منه:
   - Project URL
   - Publishable/anon key
   - Service role key
   - Database URL / pooler URL
3. ولّد `AUTH_SECRET`.
4. املأ روابط المشروع الأساسية.
5. املأ متغيرات queue/capacity حسب احتياجك.
6. شغّل المشروع وجرب auth + upload + assessment.

### English
If you are just getting started:

1. Create/configure your Supabase project.
2. Get:
   - Project URL
   - Publishable/anon key
   - Service role key
   - Database URL / pooler URL
3. Generate `AUTH_SECRET`.
4. Fill app base URLs.
5. Fill queue/capacity settings.
6. Run the app and test auth + upload + assessment.

---

## 4) Scope legend | معنى نوع المتغير

| Label | Meaning in simple Arabic | Meaning in English |
|---|---|---|
| PUBLIC | متغير قد يظهر للمتصفح، فلا تضع فيه أسرار | Can reach browser bundles; never store secrets |
| SERVER | متغير سيرفر فقط | Server-only variable |
| MIXED | يؤثر على السيرفر والواجهة/الروابط/البوتستراب | Crosses runtime concerns |
| ADMIN ONLY | يؤثر على الأدمن أو صلاحياته | Mainly affects admin-only behavior |
| USER ONLY | يؤثر على المستخدم العادي فقط | Mainly affects normal users |
| BOTH | يؤثر على الأدمن والمستخدم العادي | Affects both admin and user |

---

# 5) Group-by-group explanation | شرح المجموعات بالترتيب

---

## Group A — Base URLs and app identity | روابط المشروع الأساسية

### 1. `NEXT_PUBLIC_BASE_URL`
- **Scope:** MIXED / BOTH
- **What it controls:** canonical app URL used for origin resolution, server actions, redirects, and runtime fallback chains.
- **بالعربي:** هذا هو عنوان منصتك الأساسي. يعني الرابط الرئيسي الذي يعتبره النظام “الرابط الرسمي” للموقع.
- **Accepts:**
  - full URL: `https://example.com`
  - local host with port: `http://localhost:3000`
  - sometimes host-only values are normalized by code
- **Typical example:**
  - local: `http://localhost:3000`
  - production: `https://zootopia-club.com`
- **If you change it:** redirect behavior, callback origin logic, and some runtime origin checks may change.
- **Beginner note:** لو هذا غلط، قد تلاقي الروابط والتحويلات والـ callbacks تتصرف غلط.

### 2. `NEXTAUTH_URL`
- **Scope:** MIXED / BOTH
- **What it controls:** fallback Auth.js base URL in the origin chain.
- **بالعربي:** هذا بديل احتياطي لـ Auth.js لو الرابط الأساسي لم يُستخدم أو لم يكن واضحًا.
- **Typical example:** `https://zootopia-club.com`
- **When to use it:** useful especially in deployment consistency.
- **Do not confuse with:** `NEXT_PUBLIC_BASE_URL` — the first is the broader app URL, this one is an auth-oriented fallback.

### 3. `VERCEL_URL`
- **Scope:** MIXED / BOTH / usually platform-provided
- **What it controls:** Vercel-provided deployment host fallback.
- **بالعربي:** غالبًا Vercel يوفّره تلقائيًا. لا تحتاج تعبئته يدويًا إلا لو عندك سبب خاص.

#### Similar variables — simple distinction
- `NEXT_PUBLIC_BASE_URL` = الرابط الأساسي الذي تريد أن تعتمد عليه المنصة.
- `NEXTAUTH_URL` = fallback auth-specific base URL.
- `VERCEL_URL` = عنوان deployment الذي يعطيه Vercel غالبًا تلقائيًا.

---

## Group B — Supabase public client config | إعدادات Supabase العامة للفرونت

### 4. `NEXT_PUBLIC_SUPABASE_URL`
- **Scope:** PUBLIC / BOTH
- **What it controls:** browser-safe Supabase project URL.
- **بالعربي:** هذا عنوان مشروع Supabase نفسه.
- **Example:** `https://your-project-ref.supabase.co`
- **Used by:** browser auth helpers + public Supabase client.

### 5. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Scope:** PUBLIC / BOTH
- **What it controls:** browser-safe publishable key.
- **بالعربي:** هذا المفتاح العام الذي يسمح للفرونت إند بالاتصال بـ Supabase بشكل آمن **مع الاعتماد على RLS**.
- **Important:** ليس سرًا مثل service role.

### 6. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Scope:** PUBLIC / BOTH / legacy-compatible alias
- **What it controls:** legacy public alias still accepted by your runtime.
- **بالعربي:** مفتاح بديل/قديم للتوافق. لو النظام الحالي يعتمد `PUBLISHABLE_KEY` فالأفضل اتباع المفتاح الأساسي، لكن هذا ما زال مدعومًا كـ fallback.

#### Very important distinction
- `NEXT_PUBLIC_SUPABASE_*` = آمن نسبيًا للمتصفح **بوجود RLS مضبوط**.
- `SUPABASE_SERVICE_ROLE_KEY` = **ممنوع** على الفرونت نهائيًا.

---

## Group C — Redirect defaults | التحويلات الافتراضية بعد الدخول

### 7. `NEXT_PUBLIC_ZOOTOPIA_AUTH_USER_DEFAULT_REDIRECT`
- **Scope:** PUBLIC / USER ONLY
- **What it controls:** default internal route after successful regular-user auth/bootstrap.
- **Example:** `/`
- **بالعربي:** بعد ما المستخدم يسجل دخول بنجاح، يوديه فين افتراضيًا؟

### 8. `NEXT_PUBLIC_ZOOTOPIA_AUTH_ADMIN_DEFAULT_REDIRECT`
- **Scope:** PUBLIC / ADMIN ONLY
- **What it controls:** default internal route after successful admin auth/bootstrap.
- **Example:** `/admin`
- **بالعربي:** نفس الفكرة لكن للأدمن.

---

## Group D — Password minimum length | أقل عدد حروف للباسورد

### 9. `NEXT_PUBLIC_ZOOTOPIA_PASSWORD_MIN_LENGTH`
- **Scope:** MIXED / BOTH
- **What it controls:** canonical minimum password length across signup, reset password, and in-account password changes.
- **Default/clamp:** default 10, clamped to `8..128`
- **بالعربي:** أقل طول مقبول لكلمة السر في المنصة.
- **Example:** `10`
- **If you increase it:** المستخدم سيحتاج باسورد أطول في التسجيل وتغيير الباسورد وإعادة ضبطه.
- **If you reduce it:** لا تجعل القيمة ضعيفة. غالبًا لا تنزل تحت 8.

#### Similar/confusing variable note
هذا المتغير **ليس** له علاقة بمدة الجلسة أو queue أو credits. فقط طول كلمة المرور.

---

## Group E — PUBLIC UI shaping only | أقفال واجهة فقط للمستخدم العادي

> **Important:** هذه المتغيرات **ليست authorization boundary**. يعني لا تعتمد عليها وحدها للحماية الحقيقية. هي فقط UI shaping.

### 10. `NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_ENABLED`
- **Scope:** PUBLIC / USER ONLY
- **What it controls:** enables/disables the Assessment Studio UI lock rules for normal users.
- **Accepted booleans:** `1, true, yes, on` and `0, false, no, off`
- **بالعربي:** يشغل أو يوقف منطق قفل الواجهة للمستخدم العادي في التقييم.

### 11. `NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_MAX_QUESTION_COUNT_USER`
- **Scope:** PUBLIC / USER ONLY
- **What it controls:** max question count shown/allowed in UI for normal users.
- **Default:** `40`
- **Hard cap:** `100`
- **بالعربي:** أقصى عدد أسئلة ظاهر ومتاح في الواجهة للمستخدم العادي.

### 12. `NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_QUESTION_TYPES`
- **Scope:** PUBLIC / USER ONLY
- **What it controls:** CSV list of question types available in UI to normal users.
- **Example:** `mcq`
- **بالعربي:** أنواع الأسئلة المتاحة للمستخدم العادي في الواجهة.

### 13. `NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_OUTPUT_LANGUAGES`
- **Scope:** PUBLIC / USER ONLY
- **What it controls:** allowed output languages in the UI for normal users.
- **Example:** `en`
- **بالعربي:** لغات الإخراج المتاحة للمستخدم العادي في الواجهة.

### 14. `NEXT_PUBLIC_ZOOTOPIA_ASSESSMENT_CREDIT_DIAGNOSTICS`
- **Scope:** PUBLIC / BOTH / debug-only
- **What it controls:** client-side diagnostics logging gate for assessment credit debug output.
- **بالعربي:** يفتح log/debug في المتصفح خاص بتشخيص الكريدت. لا تفعله في الإنتاج إلا عند الحاجة.

---

## Group F — Auth.js secrets | أسرار Auth.js

### 15. `AUTH_SECRET`
- **Scope:** SERVER / BOTH
- **What it controls:** the main Auth.js signing/encryption secret.
- **بالعربي:** هذا من أهم أسرار النظام. يستخدمه Auth.js لتوقيع الجلسات والتوكنات والتشفير الداخلي.
- **Required:** نعم، أساسي.

### 16. `NEXTAUTH_SECRET`
- **Scope:** SERVER / BOTH / compatibility alias
- **What it controls:** compatibility alias / fallback.
- **بالعربي:** اسم قديم/توافقي لنفس فكرة السر. الأفضل تستخدم `AUTH_SECRET` كاسم أساسي.

#### Important distinction
- `AUTH_SECRET` = الاسم الأساسي الحديث.
- `NEXTAUTH_SECRET` = alias للتوافق.

---

## Group G — Admin allowlist | إيميلات الأدمن المسموح بها

### 17. `ZOOTOPIA_ADMIN_EMAILS`
- **Scope:** SERVER / ADMIN ONLY
- **What it controls:** server-authoritative admin allowlist.
- **Accepted input:** CSV, newline, semicolon separated emails.
- **بالعربي:** هنا تكتب إيميلات الأدمن المسموح لها بدخول مسار الأدمن.
- **Example:**
  ```env
  ZOOTOPIA_ADMIN_EMAILS=admin1@example.com,admin2@example.com
  ```
- **Warning:** لازم تكون الإيميلات صحيحة فعلًا.

### 18. `ZOOTOPIA_ADMIN_LOGIN_PASSWORD`
- **Scope:** SERVER / legacy / admin-related
- **Current note:** marked deprecated and not used by current admin auth flow.
- **بالعربي:** قديم وغير مستخدم الآن حسب التوثيق الحالي.

---

## Group H — Supabase server secrets | أسرار Supabase للسيرفر فقط

### 19. `SUPABASE_URL`
- **Scope:** SERVER / BOTH
- **What it controls:** server-side Supabase URL fallback.
- **بالعربي:** عنوان مشروع Supabase من جهة السيرفر.

### 20. `SUPABASE_SERVICE_ROLE_KEY`
- **Scope:** SERVER / BOTH / HIGHLY SENSITIVE
- **What it controls:** elevated server-side Supabase access.
- **بالعربي:** هذا مفتاح خطير جدًا لأنه يتجاوز كثيرًا من قيود RLS عند الاستخدام الخاطئ.
- **Never use in browser.**

### 21. `SUPABASE_DATABASE_URL`
- **Scope:** SERVER / BOTH
- **What it controls:** durable Postgres adapter runtime connection string.
- **Preferred:** Supabase transaction pooler URL.
- **بالعربي:** رابط الاتصال بقاعدة البيانات PostgreSQL نفسها، وليس فقط API URL.

### 22. `DATABASE_URL`
- **Scope:** SERVER / BOTH / fallback
- **What it controls:** fallback database URL.
- **بالعربي:** بديل احتياطي إذا لم يوجد `SUPABASE_DATABASE_URL`.

### 23. `ZOOTOPIA_ALLOW_PRODUCTION_MEMORY_FALLBACK`
- **Scope:** SERVER / BOTH / ops safety
- **What it controls:** whether production may fall back to in-memory behavior.
- **Recommended:** keep `false` in production.
- **بالعربي:** هل تسمح للإنتاج أن يعمل fallback في الذاكرة بدل persistence الحقيقي؟ الأفضل **لا**.

#### Similar variable distinction
- `NEXT_PUBLIC_SUPABASE_URL` = للفرونت/المتصفح.
- `SUPABASE_URL` = للسيرفر.
- `SUPABASE_SERVICE_ROLE_KEY` = أقوى صلاحية، سيرفر فقط.
- `SUPABASE_DATABASE_URL` = اتصال قاعدة البيانات نفسها.

---

## Group I — Auth admission governance | تشكيل ضغط التسجيل/الدخول

هذه المجموعة تخص **تشكيل الضغط** على signup/login، وليس active capacity نفسها مباشرة.

### 24. `ZOOTOPIA_AUTH_ADMISSION_MODE`
- **Scope:** SERVER / BOTH
- **Accepted values:** `enforce` | `disabled`
- **Default:** `enforce`
- **بالعربي:** هل نظام admission shaping مفعل أم لا؟

### 25. `ZOOTOPIA_AUTH_ADMISSION_WINDOW_SECONDS`
- **Scope:** SERVER / BOTH
- **Default/clamp:** default `900`, clamped `60..86400`
- **بالعربي:** نافذة الزمن التي يتم داخلها حساب محاولات الدخول/التسجيل.

### 26. `ZOOTOPIA_AUTH_ADMISSION_HASH_SALT`
- **Scope:** SERVER / BOTH / secret-ish operational salt
- **What it controls:** deterministic bucketing/hash stability for admission governance.
- **بالعربي:** Salt يستخدم لتثبيت hashing المتعلق بالـ admission buckets. الأفضل تثبيته بعد أول rollout.

### 27–30. Attempt limits
- `ZOOTOPIA_AUTH_SIGNIN_ACCOUNT_MAX_ATTEMPTS`
- `ZOOTOPIA_AUTH_SIGNIN_IP_MAX_ATTEMPTS`
- `ZOOTOPIA_AUTH_SIGNUP_ACCOUNT_MAX_ATTEMPTS`
- `ZOOTOPIA_AUTH_SIGNUP_IP_MAX_ATTEMPTS`
- **Scope:** SERVER / BOTH
- **Clamp:** `1..500`
- **بالعربي:** تحدد عدد المحاولات المسموح بها لكل حساب أو لكل IP في نافذة الـ admission.

#### Easy mental model
- **signin account max** = عدد محاولات دخول لنفس الحساب
- **signin IP max** = عدد محاولات دخول من نفس الـ IP
- **signup account max** = محاولات تسجيل مرتبطة بحساب/إيميل
- **signup IP max** = محاولات تسجيل من نفس الـ IP

---

## Group J — Sessions, capacity, and credits | الجلسات والسعة والكريدت

### 31. `ZOOTOPIA_SESSION_TTL_SECONDS`
- **Scope:** SERVER / BOTH
- **Default/clamp:** `3600`, clamped `60..604800`
- **What it controls:** Auth.js session lifetime for all authenticated identities.
- **بالعربي:** مدة صلاحية جلسة تسجيل الدخول نفسها.
- **Important:** يطبق على الجميع، بما فيهم الأدمن.

### 32. `ZOOTOPIA_ACTIVE_NORMAL_USER_LIMIT`
- **Scope:** SERVER / USER ONLY (normal non-exempt users)
- **Default/clamp:** `3`, clamped `1..100`
- **What it controls:** max number of active normal users governed by capacity.
- **بالعربي:** الحد الأقصى لعدد المستخدمين العاديين غير المستثنين الذين يدخلون منطق السعة/الطابور.

### 33. `ZOOTOPIA_ACTIVE_NORMAL_USER_SESSION_MINUTES`
- **Scope:** SERVER / USER ONLY
- **Default/clamp:** `15`, clamped `1..1440`
- **What it controls:** active-seat lease duration for normal users only.
- **بالعربي:** مدة حجز المقعد/الـ seat للمستخدم العادي غير المستثنى.
- **Important distinction:** هذا **ليس** مدة session login. هذا مدة **capacity lease** فقط.

### 34. `ZOOTOPIA_ACTIVE_NORMAL_USER_EXEMPT_EMAILS`
- **Scope:** SERVER / USER ONLY / exemptions
- **What it controls:** list of normal-user emails exempt from active capacity logic.
- **Accepted input:** CSV/newline/semicolon; malformed emails ignored.
- **Code note:** `elmahdyabdulla208@gmail.com` is always injected by code as exempt.
- **بالعربي:** هنا تكتب المستخدمين المستثنين من الطابور/السعة.

### 35. `ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT`
- **Scope:** SERVER / USER ONLY mostly, with exempt/admin bypass behavior
- **Default/clamp:** `33`, clamped `1..10000`
- **What it controls:** platform-wide daily credit cap across non-exempt users.
- **بالعربي:** الحد اليومي العام لاستهلاك الكريدت على مستوى المنصة كلها.
- **If exceeded:** UI-only locks can activate on upload/assessment surfaces for non-exempt users.

### 36. `ZOOTOPIA_DEFAULT_DAILY_ASSESSMENT_CREDITS`
- **Scope:** SERVER / USER ONLY
- **Default/clamp:** `3`, clamped `1..1000`
- **What it controls:** default per-user daily assessment credits.

### 37. `ZOOTOPIA_ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS`
- **Scope:** SERVER / USER ONLY
- **Default/clamp:** `24`, clamped `1..168`
- **What it controls:** renewal window for daily assessment credits.

#### Similar/confusing variables — very important
- `ZOOTOPIA_SESSION_TTL_SECONDS` = مدة بقاء المستخدم logged in.
- `ZOOTOPIA_ACTIVE_NORMAL_USER_SESSION_MINUTES` = مدة احتفاظ المستخدم العادي بمقعد من السعة.
- `ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT` = حد يومي **لكل المنصة**.
- `ZOOTOPIA_DEFAULT_DAILY_ASSESSMENT_CREDITS` = حد افتراضي **لكل مستخدم**.
- `ZOOTOPIA_ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS` = متى يتجدد رصيد اليوم.

---

## Group K — Password-gated UI locks | أقفال بالرقم السري لبعض الواجهات

### 38. `ZOOTOPIA_ASSESSMENT_PROMPT_LOCK_ENABLED`
- **Scope:** SERVER / USER ONLY mostly
- **What it controls:** enables password gate for assessment prompt lock.
- **بالعربي:** يشغّل/يوقف قفل الباسورد الخاص بمنطقة assessment prompt.

### 39. `ZOOTOPIA_ASSESSMENT_PROMPT_UNLOCK_PASSWORD`
- **Scope:** SERVER / secret operational value
- **What it controls:** unlock password for that assessment prompt gate.
- **بالعربي:** الباسورد نفسه لفك هذا القفل.

### 40. `ZOOTOPIA_GLOBAL_CREDIT_PAGE_LOCK_ENABLED`
- **Scope:** SERVER / USER ONLY mostly
- **What it controls:** enables password gate for global credit page lock.

### 41. `ZOOTOPIA_GLOBAL_CREDIT_PAGE_PASSWORD`
- **Scope:** SERVER / secret operational value
- **What it controls:** unlock password for global credit page.

---

## Group L — Email verification resend governance | تنظيم إعادة إرسال رابط التحقق

### Canonical keys
- `ZOOTOPIA_EMAIL_VERIFICATION_RESEND_MODE`
- `ZOOTOPIA_EMAIL_VERIFICATION_COOLDOWN_SECONDS`
- `ZOOTOPIA_EMAIL_VERIFICATION_MAX_ATTEMPTS`
- `ZOOTOPIA_EMAIL_VERIFICATION_WINDOW_MINUTES`
- `ZOOTOPIA_EMAIL_VERIFICATION_IP_MAX_ATTEMPTS`
- `ZOOTOPIA_EMAIL_VERIFICATION_IP_WINDOW_MINUTES`
- `ZOOTOPIA_EMAIL_VERIFICATION_HASH_SALT`

### Arabic explanation
هذه المجموعة تتحكم في:
- كل كام ثانية يسمح بإعادة إرسال التحقق
- كم محاولة مسموحة للحساب
- كم محاولة مسموحة للـ IP
- ما النافذة الزمنية
- والـ salt الخاص بالـ hashing

### Compatibility aliases
المتغيرات التي تبدأ بـ `ZOOTOPIA_VERIFICATION_RESEND_...` ما زالت مدعومة للتوافق، لكن الأفضل تعتمد canonical keys الجديدة.

---

## Group M — Password security salt | Salt لأحداث/أمان الباسورد

### 42. `ZOOTOPIA_PASSWORD_SECURITY_HASH_SALT`
- **Scope:** SERVER / BOTH
- **What it controls:** preferred salt for password-security event hashing.
- **Fallback:** may fall back to `ZOOTOPIA_EMAIL_VERIFICATION_HASH_SALT`
- **بالعربي:** Salt للأحداث أو الحماية المتعلقة بالباسورد. الأفضل تعطيه قيمة مستقلة واضحة.

---

## Group N — Storage retention | سياسة الاحتفاظ بالملفات

### 43–45. Minutes per scope
- `ZOOTOPIA_UPLOAD_RETENTION_MINUTES`
- `ZOOTOPIA_RESULT_RETENTION_MINUTES`
- `ZOOTOPIA_EXPORT_RETENTION_MINUTES`
- **Scope:** SERVER / BOTH
- **Defaults:** uploads 15, results 1440, exports 15
- **بالعربي:** تحدد كم دقيقة يُحتفظ بملفات:
  - الرفع
  - النتائج
  - التصدير

### 46–48. Retention mode per scope
- `ZOOTOPIA_UPLOAD_RETENTION_MODE`
- `ZOOTOPIA_RESULT_RETENTION_MODE`
- `ZOOTOPIA_EXPORT_RETENTION_MODE`
- **Accepted values:** `expiry` | `none`
- **بالعربي:** هل هذا النوع من الملفات له انتهاء صلاحية أم لا.

### Legacy fallback
- `ZOOTOPIA_STORAGE_RETENTION_DAYS`
- `ZOOTOPIA_STORAGE_RETENTION_HOURS`
- `ZOOTOPIA_STORAGE_RETENTION_MODE`
- قديمة/احتياطية فقط عند غياب per-scope values.

---

## Group O — Maintenance and defaults | وضع الصيانة والقيم الابتدائية

### 49. `ZOOTOPIA_MAINTENANCE_MODE_ENABLED`
- **Scope:** SERVER / BOTH
- **What it controls:** maintenance mode toggle.

### 50. `ZOOTOPIA_MAINTENANCE_SECRET`
- **Scope:** SERVER / secret
- **What it controls:** bearer auth for maintenance internal endpoint.

### 51. `ZOOTOPIA_DEFAULT_THEME_MODE`
- **Scope:** MIXED / BOTH
- **Accepted values:** only `light` is special; everything else falls back to `dark`.
- **بالعربي:** الثيم الافتراضي عند غياب الكوكي.

### 52. `ZOOTOPIA_DEFAULT_LANGUAGE`
- **Scope:** MIXED / BOTH
- **Accepted values:** only `ar` is special; everything else falls back to `en`.
- **بالعربي:** اللغة الافتراضية عند غياب الكوكي.

### 53. `ZOOTOPIA_DEBUG`
- **Scope:** SERVER / BOTH / debug
- **What it controls:** adapter debug logging.

---

## Group P — AI provider runtime | مزودات الذكاء الاصطناعي

### 54. `GOOGLE_AI_API_KEY`
- **Scope:** SERVER / BOTH
- **What it controls:** Google AI provider access.

### 55. `DASHSCOPE_API_KEY`
- **Scope:** SERVER / BOTH
- **What it controls:** DashScope/Qwen provider access.

### 56. `DASHSCOPE_BASE_URL`
- **Scope:** SERVER / BOTH
- **What it controls:** DashScope-compatible base URL.

### 57–58. Default model vars
- `ZOOTOPIA_DEFAULT_MODEL_ASSESSMENT`
- `ZOOTOPIA_DEFAULT_MODEL_INFOGRAPHIC`
- **Scope:** SERVER / BOTH
- **What they control:** default model selection per tool scope.
- **بالعربي:** الموديل الافتراضي للتقييم، والموديل الافتراضي للإنفوجرافيك.

### Legacy / optional overrides
- `GOOGLE_AI_MODEL`
- `GOOGLE_AI_ADVANCED_MODEL`
- `QWEN_MODEL`

---

## Group Q — Contact mail runtime | البريد الخاص بنموذج التواصل

### Variables
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `CONTACT_FORM_TO`

### Arabic explanation
هذه المجموعة مطلوبة لمسار `/api/contact`.  
يعني لو عندك صفحة تواصل وترسل إيميلات، هذه هي البيانات التي تشغلها.

---

## Group R — Local PDF executable overrides | تحديد مسار المتصفح للـ PDF محليًا

### 59. `ASSESSMENT_PDF_BROWSER_EXECUTABLE_PATH`
### 60. `PUPPETEER_EXECUTABLE_PATH`
- **Scope:** SERVER / local/deployment tooling
- **What they control:** browser executable used for PDF/print rendering if needed.
- **بالعربي:** لو Puppeteer/Chromium يحتاجان path واضحًا للمتصفح، تضعه هنا.

---

## Group S — Legacy Firebase compatibility | متغيرات Firebase القديمة للتوافق

هذه ليست للـ runtime الحالي المبني على Supabase، لكنها موجودة للتوافق أو السكربتات التاريخية.

- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

**بالعربي:** لا تملأها إلا إذا كنت تحتاج سكربتًا قديمًا فعلًا.

---

# 6) Practical scenarios for a beginner | سيناريوهات عملية للمبتدئ

## Scenario 1 — I want the app to run locally
### Arabic
افعل الآتي:
1. `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
2. ضع Supabase URL + public key + service role + database URL
3. ولّد `AUTH_SECRET`
4. شغّل المشروع

### English
1. Set `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
2. Fill Supabase URL + public key + service role + DB URL
3. Generate `AUTH_SECRET`
4. Run the app

---

## Scenario 2 — I want only 3 normal users active at a time
- `ZOOTOPIA_ACTIVE_NORMAL_USER_LIMIT=3`
- `ZOOTOPIA_ACTIVE_NORMAL_USER_SESSION_MINUTES=15`
- Add exempt emails in `ZOOTOPIA_ACTIVE_NORMAL_USER_EXEMPT_EMAILS`

**What happens?**  
Normal non-exempt users enter the capacity system. Exempt users do not.

---

## Scenario 3 — I want the global daily platform lock to happen earlier
- Change:
  ```env
  ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT=20
  ```

**What happens?**  
When platform-wide daily usage across non-exempt users reaches that limit, your UI-only lock logic can activate on upload/assessment surfaces.

---

## Scenario 4 — I want normal users to see only MCQ and English in Assessment UI
```env
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_ENABLED=true
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_MAX_QUESTION_COUNT_USER=40
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_QUESTION_TYPES=mcq
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_OUTPUT_LANGUAGES=en
```

---

## Scenario 5 — I want stronger password rules
```env
NEXT_PUBLIC_ZOOTOPIA_PASSWORD_MIN_LENGTH=12
```

**What happens?**  
Signup, reset-password, and password-change flows require at least 12 characters if your code remains aligned with this canonical variable.

---

# 7) How to generate the required secrets/keys | كيف تولد المفاتيح المطلوبة

> **Important / مهم:**
> Never commit secrets into Git. Store them in `.env.local`, your deployment platform's secrets manager, or secure CI/CD secret storage.

## A) Generate Auth.js secret (recommended official way)

### Official command
```bash
npm exec auth secret
```

### Alternative form
```bash
npx auth secret
```

### Arabic explanation
هذا هو **الأمر الرسمي الموصى به** لتوليد `AUTH_SECRET`.  
الأمر ينشئ قيمة قوية وعشوائية ويضعها في ملف env المناسب حسب بيئتك.  
هذا هو أفضل اختيار لـ Auth.js.

## B) Generate a random strong salt or generic secret with PowerShell

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Better cryptographic PowerShell option
```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### Arabic explanation
هذا مناسب لـ:
- `ZOOTOPIA_AUTH_ADMISSION_HASH_SALT`
- `ZOOTOPIA_EMAIL_VERIFICATION_HASH_SALT`
- `ZOOTOPIA_PASSWORD_SECURITY_HASH_SALT`
- أو أي secret random value أخرى

## C) Generate with Node.js crypto
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## D) Generate with OpenSSL
```bash
openssl rand -base64 32
```

### Which one should you use?
- **For `AUTH_SECRET`:** use **`npm exec auth secret`** first.
- **For salts and generic secrets:** PowerShell crypto / Node crypto / OpenSSL are all practical and common.

---

# 8) Where do I get Supabase values from? | أجيب قيم Supabase منين؟

### Arabic
من لوحة Supabase:
1. افتح المشروع
2. اذهب إلى **Settings / API** أو **Connect** حسب واجهة المشروع
3. خذ:
   - Project URL
   - publishable / anon key
   - service role key (إن كنت تستخدمها على السيرفر)
4. لقاعدة البيانات خذ connection string / pooler URL من إعدادات DB/Connection

### English
From your Supabase dashboard:
1. Open your project
2. Go to **Settings / API** or **Connect**
3. Copy:
   - Project URL
   - publishable / anon key
   - service role key (server only)
4. Get your DB connection / pooler URL from database connection settings

---

# 9) Most important dangerous mistakes | أخطر الأخطاء الشائعة

### 1. Putting server secrets in `NEXT_PUBLIC_*`
**Wrong.**  
Do not put:
- `AUTH_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- DB URLs
- salts
inside public vars.

### 2. Forgetting restart/redeploy
إذا عدلت env ولم تعِد تشغيل المشروع، قد تظن أن المتغير لا يعمل.

### 3. Confusing session TTL with capacity lease
- login session ≠ active seat lease

### 4. Confusing per-user daily credits with global daily platform limit
- per-user daily limit ≠ global platform daily limit

### 5. Using old alias when canonical variable exists
لو عندك canonical key حديثة، الأفضل تعتمدها وتترك alias فقط للتوافق.

---

# 10) Suggested beginner baseline values | قيم مقترحة للمبتدئ

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000

NEXT_PUBLIC_ZOOTOPIA_AUTH_USER_DEFAULT_REDIRECT=/
NEXT_PUBLIC_ZOOTOPIA_AUTH_ADMIN_DEFAULT_REDIRECT=/admin
NEXT_PUBLIC_ZOOTOPIA_PASSWORD_MIN_LENGTH=10

NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_ENABLED=true
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_MAX_QUESTION_COUNT_USER=40
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_QUESTION_TYPES=mcq
NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_OUTPUT_LANGUAGES=en

AUTH_SECRET=<generate with npm exec auth secret>
ZOOTOPIA_ADMIN_EMAILS=admin@example.com

ZOOTOPIA_AUTH_ADMISSION_MODE=enforce
ZOOTOPIA_AUTH_ADMISSION_WINDOW_SECONDS=900
ZOOTOPIA_AUTH_SIGNIN_ACCOUNT_MAX_ATTEMPTS=12
ZOOTOPIA_AUTH_SIGNIN_IP_MAX_ATTEMPTS=60
ZOOTOPIA_AUTH_SIGNUP_ACCOUNT_MAX_ATTEMPTS=3
ZOOTOPIA_AUTH_SIGNUP_IP_MAX_ATTEMPTS=15

ZOOTOPIA_SESSION_TTL_SECONDS=3600
ZOOTOPIA_ACTIVE_NORMAL_USER_LIMIT=3
ZOOTOPIA_ACTIVE_NORMAL_USER_SESSION_MINUTES=15
ZOOTOPIA_ACTIVE_NORMAL_USER_EXEMPT_EMAILS=elmahdyabdulla208@gmail.com

ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT=33
ZOOTOPIA_DEFAULT_DAILY_ASSESSMENT_CREDITS=3
ZOOTOPIA_ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS=24
```

---

# 11) Quick troubleshooting guide | دليل سريع لو حصلت مشكلة

## Problem: login/redirects are weird
Check:
- `NEXT_PUBLIC_BASE_URL`
- `NEXTAUTH_URL`
- restart app after change

## Problem: Supabase auth not working
Check:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DATABASE_URL`

## Problem: admin not recognized
Check:
- `ZOOTOPIA_ADMIN_EMAILS`
- email spelling
- delimiter formatting

## Problem: exempt user still enters queue
Check:
- `ZOOTOPIA_ACTIVE_NORMAL_USER_EXEMPT_EMAILS`
- exact email spelling
- whether code injects special exemptions

## Problem: global daily UI lock never activates
Check:
- `ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT`
- server-side credit aggregation logic
- exempt/admin exclusion behavior

## Problem: password too short error is inconsistent
Check:
- `NEXT_PUBLIC_ZOOTOPIA_PASSWORD_MIN_LENGTH`
- frontend validation alignment
- backend validation alignment

---

# 12) Final recommendation | التوصية النهائية

### Arabic
لو أنت مبتدئ جدًا، تحكم في المنصة بهذا الترتيب:

1. **روابط المشروع**
2. **Supabase public + server keys**
3. **AUTH_SECRET**
4. **Admin emails**
5. **Session / capacity / exempt / credits**
6. **UI locks**
7. **Retention**
8. **AI provider keys**
9. **Contact mail**

ولا تغيّر كل شيء مرة واحدة.  
غيّر مجموعة واحدة، جرّب، ثم انتقل للي بعدها.

### English
If you are a real beginner, control the platform in this order:

1. Base URLs
2. Supabase public + server keys
3. `AUTH_SECRET`
4. Admin emails
5. Session / capacity / exempt / credits
6. UI locks
7. Retention
8. AI provider keys
9. Contact mail

Do not change everything at once.  
Change one group, test it, then move to the next.

---

# 13) Official references used in this guide | المصادر الرسمية

1. **Auth.js environment variables / secret generation**  
   - `AUTH_SECRET` and official CLI generation via `npm exec auth secret` / `npx auth secret`
2. **Next.js environment variables**  
   - `NEXT_PUBLIC_*` behavior and build/runtime notes
3. **Supabase API keys / key safety**  
   - public keys vs service role behavior
4. **Supabase Storage security / access control**

---

## Final note | ملاحظة أخيرة

This guide explains the **current env contract you provided**.  
If your code changes later, the guide should be refreshed too.

هذا الدليل يشرح **النسخة الحالية** من env contract التي أرسلتها.  
لو الكود اتغير لاحقًا، لازم الدليل يتحدث أيضًا.
