import type { Locale } from "@zootopia/shared-types";

export const SITE_WHATSAPP_NUMBER = "+201124511183";
export const SITE_WHATSAPP_LINK = "https://wa.me/201124511183";
export const SITE_DONATION_NUMBER = "01124511183";

type DonationStoryCard = {
  title: string;
  body: string;
};

type DonationCostItem = {
  title: string;
  body: string;
};

type PrivacySection = {
  title: string;
  body: string;
};

type SiteContent = {
  navigation: {
    journey: string;
    about: string;
    privacy: string;
    contact: string;
    donation: string;
    openWorkspace: string;
    signIn: string;
    donationCta: string;
    balanceLabel: string;
    balancePlaceholder: string;
    balanceHint: string;
  };
  about: {
    eyebrow: string;
    title: string;
    subtitle: string;
    signatureArabicLabel: string;
    signatureArabic: string;
    signatureEnglishLabel: string;
    signatureEnglish: string;
    platformIntroTitle: string;
    platformIntroBody: string;
    purposeTitle: string;
    purposeBody: string;
    missionTitle: string;
    missionBody: string;
    infographicSoonLabel: string;
    infographicSoonTitle: string;
    infographicSoonBody: string;
    whatsappTitle: string;
    whatsappBody: string;
    whatsappCta: string;
    illustrationLabel: string;
    profileTitle: string;
    profileBody: string;
  };
  contact: {
    eyebrow: string;
    title: string;
    subtitle: string;
    introBody: string;
    methodsTitle: string;
    methodsBody: string;
    whatsappTitle: string;
    whatsappBody: string;
    whatsappCta: string;
    formTitle: string;
    formBody: string;
    privacyNote: string;
    responseTimeNote: string;
    fields: {
      name: string;
      email: string;
      purpose: string;
      subject: string;
      message: string;
    };
    placeholders: {
      name: string;
      email: string;
      subject: string;
      message: string;
    };
    purposes: {
      general: string;
      issue: string;
      suggestion: string;
    };
    submitIdle: string;
    submitPending: string;
    successTitle: string;
    successBody: string;
    unavailableTitle: string;
    unavailableBody: string;
    failureTitle: string;
    failureBody: string;
    validation: {
      nameRequired: string;
      emailRequired: string;
      emailInvalid: string;
      subjectRequired: string;
      messageRequired: string;
    };
  };
  donation: {
    eyebrow: string;
    title: string;
    subtitle: string;
    intro: string;
    heroHighlights: string[];
    storyCards: DonationStoryCard[];
    costsTitle: string;
    costsIntro: string;
    costItems: DonationCostItem[];
    supportTitle: string;
    supportBody: string;
    supportItems: string[];
    contactTitle: string;
    contactBody: string;
    contactLabel: string;
    contactNote: string;
    walletTitle: string;
    walletBody: string;
    walletNumberLabel: string;
    trustTitle: string;
    trustBody: string;
    contactCta: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    subtitle: string;
    effectiveDateLabel: string;
    effectiveDateValue: string;
    intro: string;
    sectionsTitle: string;
    sections: PrivacySection[];
    rightsTitle: string;
    rightsBody: string;
    contactTitle: string;
    contactBody: string;
    contactCta: string;
  };
};

const SITE_SIGNATURE_ARABIC =
  "تم برمجة وتطوير وتمويل هذه المنصة بواسطة ابن عبدالله يوسف دفعة 2022 قسم كيمياء حيوان";
const SITE_SIGNATURE_ENGLISH =
  "This platform was programmed, developed, and funded by Ebn Abdallah Youssef, Class of 2022, Chemistry-Zoology Department.";

// Donation page copy lives in this shared site-content module so EN/AR stay structurally aligned.
// Future agents should preserve the same trust, cost-transparency, and personal-contact sections in both locales.
const SITE_CONTENT: Record<Locale, SiteContent> = {
  en: {
    navigation: {
      journey: "Platform Journey",
      about: "About",
      privacy: "Privacy Policy",
      contact: "Contact",
      donation: "Donation",
      openWorkspace: "Open Workspace",
      signIn: "Sign In",
      donationCta: "Donate",
      balanceLabel: "Balance",
      balancePlaceholder: "Soon",
      balanceHint: "Balance placeholder",
    },
    about: {
      eyebrow: "About Zootopia Club",
      title: "A premium science-learning space built to make study work calmer, clearer, and more useful.",
      subtitle:
        "Zootopia Club is an educational and scientific platform created to help students turn dense academic material into better revision, assessment, and guided AI-assisted study flows.",
      signatureArabicLabel: "Arabic platform signature",
      signatureArabic: SITE_SIGNATURE_ARABIC,
      signatureEnglishLabel: "English platform signature",
      signatureEnglish: SITE_SIGNATURE_ENGLISH,
      platformIntroTitle: "What Zootopia Club is",
      platformIntroBody:
        "Zootopia Club brings document-first study workflows, structured assessment generation, and science-oriented learning surfaces into one coherent experience for Faculty of Science students.",
      purposeTitle: "Educational and scientific purpose",
      purposeBody:
        "The platform is designed to help learners study more intentionally, organize academic material more clearly, and keep scientific content readable, practical, and easier to revise.",
      missionTitle: "AI-assisted study mission",
      missionBody:
        "Its mission is to use AI carefully, not noisily, so students can move from raw files and heavy notes into cleaner summaries, smarter practice, and better study decisions.",
      infographicSoonLabel: "Coming soon",
      infographicSoonTitle: "Infographic Studio is the next polished layer of the learning experience.",
      infographicSoonBody:
        "The infographic feature is being refined to turn complex science content into clearer visual study outputs without breaking the current assessment-first architecture.",
      whatsappTitle: "WhatsApp contact",
      whatsappBody:
        "For quick communication, follow-up questions, or direct platform-related discussion, WhatsApp remains the fastest contact path.",
      whatsappCta: "Open WhatsApp",
      illustrationLabel: "Founder and platform profile illustration",
      profileTitle: "Built with academic ownership",
      profileBody:
        "This platform was programmed, developed, and funded with a focus on academic usefulness, design quality, and a respectful experience for science students.",
    },
    contact: {
      eyebrow: "Contact",
      title: "Reach the platform team through a calm, direct, and practical support flow.",
      subtitle:
        "To contact admin Ebn Abdallah, report any issue, or send requests and suggestions, please contact us through the following methods.",
      introBody:
        "Use WhatsApp for fast conversation, or send a structured message through the form for platform support, issue reports, or thoughtful suggestions.",
      methodsTitle: "Communication paths",
      methodsBody:
        "Both routes below are intended for real platform communication, including questions about access, improvement ideas, or technical issues that should reach the admin team safely.",
      whatsappTitle: "WhatsApp",
      whatsappBody:
        "Best for quick follow-up, direct guidance, and fast communication around the platform experience.",
      whatsappCta: "Chat on WhatsApp",
      formTitle: "Email contact form",
      formBody:
        "Use this form when you want to send a more complete message to the platform team. The destination email stays on the server and is never shown publicly in the interface.",
      privacyNote:
        "Your message is relayed server-side so the admin destination address remains private.",
      responseTimeNote:
        "Please include enough detail for issue reports, requests, or suggestions so the team can respond clearly.",
      fields: {
        name: "Your name",
        email: "Your email",
        purpose: "Purpose",
        subject: "Subject",
        message: "Message",
      },
      placeholders: {
        name: "Enter your full name",
        email: "you@example.com",
        subject: "What would you like to discuss?",
        message:
          "Describe the issue, request, or suggestion with enough detail to help the platform team respond well.",
      },
      purposes: {
        general: "General contact",
        issue: "Report an issue",
        suggestion: "Request or suggestion",
      },
      submitIdle: "Send message",
      submitPending: "Sending...",
      successTitle: "Message sent",
      successBody:
        "Your message has been sent to the platform team successfully.",
      unavailableTitle: "Contact email is temporarily unavailable",
      unavailableBody:
        "The contact email relay is not configured in this environment yet. Please use WhatsApp for now.",
      failureTitle: "Message could not be sent",
      failureBody:
        "Please try again in a moment, or use WhatsApp if the issue is urgent.",
      validation: {
        nameRequired: "Please enter your name.",
        emailRequired: "Please enter your email address.",
        emailInvalid: "Please enter a valid email address.",
        subjectRequired: "Please enter a subject.",
        messageRequired: "Please enter a message.",
      },
    },
    donation: {
      eyebrow: "Support the platform",
      title:
        "Help keep Zootopia Club alive for today’s students, and meaningful for the classes that helped build it.",
      subtitle:
        "Zootopia Club is a real educational project for Faculty of Science students. Thoughtful support helps cover the monthly costs required to keep the platform online, improving, and ready for stronger future features.",
      intro:
        "Every contribution helps protect something practical: a student-focused platform built to serve learners now, support future cohorts, and leave a proud fingerprint for the 2022 and 2023 classes. Support is never an obligation, but it can make the difference between a platform that pauses and one that keeps growing.",
      heroHighlights: [
        "Real educational project",
        "Recurring monthly costs",
        "Built for current and future students",
      ],
      storyCards: [
        {
          title: "A project with real educational value",
          body:
            "Zootopia Club is not a passing idea. It is a practical platform designed to help Faculty students study with clearer tools, better structure, and smarter AI-assisted workflows.",
        },
        {
          title: "A legacy for the 2022 and 2023 classes",
          body:
            "The platform can become something the 2022 and 2023 classes are remembered for: a useful academic contribution that reflects initiative, care, and modern thinking.",
        },
        {
          title: "Continuity is not automatic",
          body:
            "To stay honest and transparent, the platform may stop at any time if monthly running costs are not covered. Sustaining it requires ongoing support, not a one-time effort.",
        },
      ],
      costsTitle: "What donations help cover",
      costsIntro:
        "Support goes to recurring costs that keep the platform stable today while making room for future improvements.",
      costItems: [
        {
          title: "Hosting and infrastructure",
          body:
            "Servers, storage, bandwidth, and the technical foundation that keeps the platform available.",
        },
        {
          title: "Continuous development",
          body:
            "Design, fixes, maintenance, and steady improvement so the experience remains reliable and useful.",
        },
        {
          title: "AI model usage",
          body:
            "The usage costs for different AI models that power smarter academic features across the platform.",
        },
        {
          title: "Future features and innovation",
          body:
            "New educational ideas, stronger tools, upgrades, and thoughtful experiments that can benefit future students.",
        },
      ],
      supportTitle: "What your support makes possible",
      supportBody:
        "Donations help Zootopia Club continue, expand, and deliver stronger features over time. Even a modest contribution can help protect the platform’s continuity and move new ideas closer to reality.",
      supportItems: [
        "keep the platform available for current students",
        "fund meaningful upgrades instead of emergency pauses",
        "support a hopeful, future-facing learning experience",
      ],
      contactTitle: "Donate or ask personally on WhatsApp",
      contactBody:
        "If you want to donate, ask a question, or help in a more personal way, you can contact the same WhatsApp number directly. Personal communication is always welcome.",
      contactLabel: "Direct WhatsApp contact",
      contactNote: "The same number can be used for donation coordination or personal questions.",
      walletTitle: "Egyptian wallet / transfer reference",
      walletBody:
        "If you prefer an Egyptian mobile wallet transfer, the same contact can guide you and the local transfer reference remains available below.",
      walletNumberLabel: "Local transfer number",
      trustTitle: "A respectful note",
      trustBody:
        "Support is appreciated, never pressured. The goal is simple: help a sincere student-centered platform continue with dignity, transparency, and room to grow.",
      contactCta: "Chat on WhatsApp",
    },
    privacy: {
      eyebrow: "Privacy Policy",
      title: "Privacy Policy for Zootopia Club",
      subtitle:
        "This policy explains what data we handle, why we handle it, and the controls available to users of the platform.",
      effectiveDateLabel: "Effective date",
      effectiveDateValue: "April 9, 2026",
      intro:
        "Zootopia Club is an educational AI platform. We keep data handling tied to platform operations, with server-side ownership for authentication, profile updates, uploads, and generated outputs.",
      sectionsTitle: "How we handle data",
      sections: [
        {
          title: "Account creation and sign-in",
          body:
            "Sign-in is completed through Supabase Auth using email/password. After sign-in, the server creates a secure HTTP-only session cookie to access protected workspace routes.",
        },
        {
          title: "Profile information",
          body:
            "Your profile can include full name, university code, phone number, phone country, and nationality. This information is used for account identity, profile completion requirements, and platform eligibility checks.",
        },
        {
          title: "Uploaded documents",
          body:
            "Uploaded source files are owner-scoped workspace assets. They are treated as temporary workspace data and are cleaned on logout and by expiry cleanup flows.",
        },
        {
          title: "Generated results",
          body:
            "Assessment result and export artifacts are owner-scoped and follow server-side env-driven retention windows by storage type. Infographic outputs are owner-scoped records and follow the active product lifecycle unless explicitly removed by maintenance actions.",
        },
        {
          title: "Contact requests",
          body:
            "Messages sent from the Contact page are relayed by a server-side email flow. Destination email addresses and mail credentials remain server-only and are not exposed to the browser.",
        },
        {
          title: "Cookies and sessions",
          body:
            "The platform uses an HTTP-only session cookie for authenticated access and preference cookies for locale/theme behavior. Session duration is controlled by server configuration.",
        },
        {
          title: "Supabase-backed processing",
          body:
            "Authentication and server-authoritative data handling are built on Supabase services, including Supabase Auth plus backend-managed Postgres and private bucket access.",
        },
        {
          title: "Logging and abuse protection",
          body:
            "The platform records operational and security-related events (for example auth/session, upload, assessment, export, and cleanup actions) for reliability and administrative review. No advertising tracker integration is currently implemented in this codebase.",
        },
        {
          title: "User rights and contact",
          body:
            "You can request correction, access, or deletion help for your platform data by contacting the team through the public Contact page.",
        },
      ],
      rightsTitle: "Data rights",
      rightsBody:
        "We review requests related to your account data in good faith and respond through the available support channel.",
      contactTitle: "Questions about this policy",
      contactBody:
        "For privacy questions or requests, please use the official platform contact route so your request reaches the team securely.",
      contactCta: "Contact the platform team",
    },
  },
  ar: {
    navigation: {
      journey: "رحلة المنصة",
      about: "من نحن",
      privacy: "سياسة الخصوصية",
      contact: "تواصل معنا",
      donation: "الدعم",
      openWorkspace: "فتح مساحة العمل",
      signIn: "تسجيل الدخول",
      donationCta: "ادعم المنصة",
      balanceLabel: "الرصيد",
      balancePlaceholder: "قريباً",
      balanceHint: "مؤشر رصيد تجريبي",
    },
    about: {
      eyebrow: "حول نادي زوتوبيا",
      title: "مساحة علمية أنيقة صُممت لتجعل الدراسة أوضح وأهدأ وأكثر فائدة.",
      subtitle:
        "زوتوبيا كلوب منصة تعليمية وعلمية صُممت لمساعدة الطلاب على تحويل المحتوى الأكاديمي الكثيف إلى مراجعة أفضل وتقييمات أوضح ومسارات دراسة مدعومة بالذكاء الاصطناعي بشكل منظم.",
      signatureArabicLabel: "التوقيع العربي للمنصة",
      signatureArabic: SITE_SIGNATURE_ARABIC,
      signatureEnglishLabel: "الترجمة الإنجليزية",
      signatureEnglish: SITE_SIGNATURE_ENGLISH,
      platformIntroTitle: "ما هي منصة زوتوبيا كلوب",
      platformIntroBody:
        "تجمع زوتوبيا كلوب بين مسارات الدراسة المعتمدة على الملفات، وتوليد التقييمات المنظمة، وتجارب التعلم العلمية في تجربة واحدة مترابطة لطلاب كلية العلوم.",
      purposeTitle: "الهدف التعليمي والعلمي",
      purposeBody:
        "صُممت المنصة لمساعدة المتعلم على الدراسة بوعي أكبر، وتنظيم المادة الأكاديمية بصورة أوضح، والحفاظ على المحتوى العلمي مقروءاً وعملياً وأسهل في المراجعة.",
      missionTitle: "رسالة الدراسة المدعومة بالذكاء الاصطناعي",
      missionBody:
        "تتمثل الرسالة في استخدام الذكاء الاصطناعي بحكمة وهدوء، حتى ينتقل الطالب من الملفات الخام والملاحظات الكثيفة إلى مخرجات أوضح وتدريب أذكى وقرارات دراسة أفضل.",
      infographicSoonLabel: "قريباً",
      infographicSoonTitle: "استوديو الإنفوجرافيك هو الطبقة القادمة من التجربة التعليمية المصقولة.",
      infographicSoonBody:
        "يجري تحسين ميزة الإنفوجرافيك لتحويل المحتوى العلمي المعقد إلى مخرجات بصرية أوضح، من دون كسر البنية الحالية التي تركز أولاً على التقييمات.",
      whatsappTitle: "التواصل عبر واتساب",
      whatsappBody:
        "للتواصل السريع أو المتابعة أو النقاش المباشر حول المنصة، يظل واتساب هو أسرع وسيلة تواصل.",
      whatsappCta: "فتح واتساب",
      illustrationLabel: "رسم تعريفي بالمطور وصاحب المنصة",
      profileTitle: "منصة مبنية بروح أكاديمية مسؤولة",
      profileBody:
        "تمت برمجة هذه المنصة وتطويرها وتمويلها مع التركيز على الفائدة الأكاديمية وجودة التصميم وتجربة تحترم طلاب العلوم.",
    },
    contact: {
      eyebrow: "تواصل معنا",
      title: "تواصل مع فريق المنصة عبر مسار دعم هادئ ومباشر وعملي.",
      subtitle:
        "للتواصل مع الأدمن ابن عبدالله، أو الإبلاغ عن أي مشكلة، أو إرسال الطلبات والاقتراحات، يرجى التواصل معنا من خلال الوسائل التالية.",
      introBody:
        "استخدم واتساب للمحادثة السريعة، أو أرسل رسالة منظمة عبر النموذج إذا كنت تريد توضيحاً أكبر بخصوص مشكلة أو طلب أو اقتراح.",
      methodsTitle: "مسارات التواصل",
      methodsBody:
        "المساران أدناه موجهان للتواصل الحقيقي مع المنصة، سواء للأسئلة، أو أفكار التطوير، أو المشكلات التقنية التي يجب أن تصل إلى فريق الإدارة بشكل آمن.",
      whatsappTitle: "واتساب",
      whatsappBody:
        "الأنسب للمتابعة السريعة، والإرشاد المباشر، والتواصل السريع حول تجربة استخدام المنصة.",
      whatsappCta: "المحادثة على واتساب",
      formTitle: "نموذج التواصل عبر البريد",
      formBody:
        "استخدم هذا النموذج عندما تريد إرسال رسالة أكثر اكتمالاً إلى فريق المنصة. يظل البريد الوجهة محفوظاً على الخادم ولا يظهر علناً في الواجهة.",
      privacyNote:
        "يتم تمرير رسالتك من جهة الخادم حتى تظل وجهة البريد الخاصة بالأدمن مخفية عن الواجهة العامة.",
      responseTimeNote:
        "يرجى كتابة تفاصيل كافية عند الإبلاغ عن مشكلة أو إرسال طلب أو اقتراح حتى يستطيع الفريق الرد بوضوح.",
      fields: {
        name: "الاسم",
        email: "البريد الإلكتروني",
        purpose: "الغرض",
        subject: "الموضوع",
        message: "الرسالة",
      },
      placeholders: {
        name: "اكتب اسمك الكامل",
        email: "you@example.com",
        subject: "ما الموضوع الذي تريد مناقشته؟",
        message:
          "اشرح المشكلة أو الطلب أو الاقتراح بتفاصيل كافية تساعد فريق المنصة على الرد بشكل جيد.",
      },
      purposes: {
        general: "تواصل عام",
        issue: "الإبلاغ عن مشكلة",
        suggestion: "طلب أو اقتراح",
      },
      submitIdle: "إرسال الرسالة",
      submitPending: "جارٍ الإرسال...",
      successTitle: "تم إرسال الرسالة",
      successBody: "تم إرسال رسالتك إلى فريق المنصة بنجاح.",
      unavailableTitle: "خدمة البريد غير متاحة حالياً",
      unavailableBody:
        "خدمة تمرير البريد من جهة الخادم غير مهيأة في هذه البيئة بعد. استخدم واتساب حالياً.",
      failureTitle: "تعذر إرسال الرسالة",
      failureBody:
        "يرجى المحاولة مرة أخرى بعد قليل، أو استخدم واتساب إذا كانت الحالة عاجلة.",
      validation: {
        nameRequired: "يرجى إدخال الاسم.",
        emailRequired: "يرجى إدخال البريد الإلكتروني.",
        emailInvalid: "يرجى إدخال بريد إلكتروني صحيح.",
        subjectRequired: "يرجى إدخال الموضوع.",
        messageRequired: "يرجى كتابة الرسالة.",
      },
    },
    donation: {
      eyebrow: "ادعم المنصة",
      title: "ساعد زوتوبيا كلوب على البقاء حية لطلاب اليوم، وأن تظل بصمة نفخر بها لدفعتَي 2022 و2023.",
      subtitle:
        "زوتوبيا كلوب مشروع تعليمي حقيقي موجه لطلاب كلية العلوم. ودعمك يساعد في تغطية التكاليف الشهرية اللازمة لاستمرار المنصة وتطويرها وإطلاق مزايا أقوى في المستقبل.",
      intro:
        "كل مساهمة، مهما كانت بسيطة، تحمي شيئاً عملياً ومفيداً: منصة نحاول أن تخدم الطلاب الآن، وتفيد من يأتي بعدهم، وتترك أثراً مشرفاً لدفعتَي 2022 و2023. الدعم ليس واجباً على أحد، لكنه قد يكون الفارق بين منصة تتوقف ومنصة تستمر وتنمو.",
      heroHighlights: [
        "مشروع تعليمي حقيقي",
        "تكاليف شهرية متجددة",
        "لطلاب اليوم وطلاب المستقبل",
      ],
      storyCards: [
        {
          title: "مشروع له قيمة تعليمية حقيقية",
          body:
            "زوتوبيا كلوب ليست فكرة عابرة، بل منصة عملية نحاول من خلالها تقديم أدوات أوضح وتجربة أذكى وأكثر احتراماً لطلاب الكلية في الدراسة والمراجعة.",
        },
        {
          title: "بصمة جميلة لدفعتَي 2022 و2023",
          body:
            "يمكن لهذا المشروع أن يكون شيئاً نفتخر به جميعاً: مساهمة أكاديمية حديثة ومفيدة تترك أثراً واضحاً باسم دفعتَي 2022 و2023.",
        },
        {
          title: "الاستمرار ليس مضموناً تلقائياً",
          body:
            "بكل صراحة ووضوح، قد تتوقف المنصة في أي وقت إذا لم يتم تغطية المصاريف الشهرية اللازمة لتشغيلها. الاستمرار يحتاج إلى دعم حقيقي ومتجدد.",
        },
      ],
      costsTitle: "ما الذي تساعد التبرعات على تغطيته",
      costsIntro:
        "الدعم يذهب إلى مصاريف حقيقية ومتكررة تُبقي المنصة مستقرة اليوم وتفتح لها مساحة للتطور غداً.",
      costItems: [
        {
          title: "الاستضافة والبنية التشغيلية",
          body:
            "الخوادم والتخزين والنطاق وكل ما يلزم لإبقاء المنصة متاحة وموثوقة.",
        },
        {
          title: "التطوير والتحسين المستمر",
          body:
            "التصميم والصيانة والإصلاحات والتحسينات اليومية التي تجعل التجربة أفضل وأكثر فائدة.",
        },
        {
          title: "تكاليف استخدام نماذج الذكاء الاصطناعي",
          body:
            "رسوم الاستخدام الخاصة بالنماذج المختلفة التي تدعم مزايا المنصة التعليمية.",
        },
        {
          title: "المزايا المستقبلية والابتكار التعليمي",
          body:
            "أفكار جديدة وتحديثات وأدوات أقوى وتجارب تعليمية مبتكرة تفيد الطلاب في المستقبل.",
        },
      ],
      supportTitle: "ما الذي يتيحه هذا الدعم",
      supportBody:
        "التبرعات تساعد زوتوبيا كلوب على الاستمرار والتوسع وتقديم مزايا أقوى مع الوقت. وحتى المساهمة البسيطة قد تصنع فرقاً كبيراً في حماية استمرارية المنصة ودفعها إلى الأمام.",
      supportItems: [
        "إبقاء المنصة متاحة للطلاب الحاليين",
        "تمويل التطوير بدلاً من التوقف الاضطراري",
        "تمهيد الطريق لمزايا أقوى وأفكار تعليمية جديدة",
      ],
      contactTitle: "للتبرع أو الاستفسار شخصياً عبر واتساب",
      contactBody:
        "إذا كنت ترغب في التبرع، أو لديك سؤال، أو تريد المساعدة بطريقة شخصية، يمكنك التواصل مباشرة على نفس رقم واتساب. يسعدنا جداً التواصل معك بشكل مباشر.",
      contactLabel: "رقم واتساب المباشر",
      contactNote: "نفس الرقم مخصص للتبرع أو الاستفسارات الشخصية.",
      walletTitle: "مرجع التحويل عبر المحافظ المصرية",
      walletBody:
        "إذا كان الأنسب لك هو التحويل عبر محفظة إلكترونية مصرية، فيمكن تنسيق ذلك من خلال نفس وسيلة التواصل، كما أن رقم التحويل المحلي متاح أدناه.",
      walletNumberLabel: "رقم التحويل المحلي",
      trustTitle: "ملاحظة باحترام",
      trustBody:
        "الدعم محل تقدير كبير، لكنه ليس مطلوباً بإلحاح. الهدف ببساطة هو مساعدة منصة طلابية صادقة على الاستمرار بوضوح وكرامة ومساحة أكبر للنمو.",
      contactCta: "التواصل عبر واتساب",
    },
    privacy: {
      eyebrow: "سياسة الخصوصية",
      title: "سياسة الخصوصية في منصة زوتوبيا كلوب",
      subtitle:
        "توضح هذه السياسة ما البيانات التي نعالجها، ولماذا نعالجها، وما الخيارات المتاحة للمستخدم داخل المنصة.",
      effectiveDateLabel: "تاريخ السريان",
      effectiveDateValue: "9 أبريل 2026",
      intro:
        "زوتوبيا كلوب منصة تعليمية مدعومة بالذكاء الاصطناعي. نعتمد مسار معالجة بيانات مرتبط بتشغيل المنصة فقط، مع بقاء المصادقة وتحديثات الحساب ورفع الملفات وتوليد النتائج تحت سلطة الخادم.",
      sectionsTitle: "كيف نتعامل مع البيانات",
      sections: [
        {
          title: "إنشاء الحساب وتسجيل الدخول",
          body:
            "يتم تسجيل الدخول عبر Supabase Auth باستخدام البريد الإلكتروني وكلمة المرور. بعد نجاح الدخول، ينشئ الخادم ملف جلسة HTTP-only آمن للوصول إلى مسارات مساحة العمل المحمية.",
        },
        {
          title: "بيانات الملف الشخصي",
          body:
            "قد يتضمن ملفك الشخصي الاسم الكامل، والكود الجامعي، ورقم الهاتف، ودولة الهاتف، والجنسية. تُستخدم هذه البيانات لهوية الحساب ومتطلبات اكتمال الملف وقيود الأهلية داخل المنصة.",
        },
        {
          title: "الملفات المرفوعة",
          body:
            "تُحفظ الملفات المرفوعة ضمن نطاق المالك فقط وتُعامل كبيانات عمل مؤقتة. يتم تنظيفها عند تسجيل الخروج وكذلك عبر مسارات انتهاء الصلاحية والتنظيف الدوري.",
        },
        {
          title: "النتائج المولدة",
          body:
            "نتائج التقييم وملفات التصدير المرتبطة بها تُدار ضمن نطاق المالك وتخضع حالياً لدورة احتفاظ مدتها ثلاثة أيام في منطق الخادم. مخرجات الإنفوجرافيك تُحفظ كسجلات ضمن نطاق المالك وفق السلوك الحالي للمنتج ما لم تُزال لاحقاً عبر عمليات صيانة مستقبلية.",
        },
        {
          title: "طلبات التواصل",
          body:
            "الرسائل المرسلة من صفحة التواصل تمر عبر مسار بريد يعمل من الخادم. تبقى عناوين الوجهة وبيانات اعتماد البريد في الخادم ولا تظهر في المتصفح.",
        },
        {
          title: "ملفات تعريف الارتباط والجلسة",
          body:
            "تستخدم المنصة ملف جلسة HTTP-only للوصول الموثق، بالإضافة إلى ملفات تفضيلات للغة والمظهر. مدة الجلسة يحددها إعداد الخادم.",
        },
        {
          title: "المعالجة المعتمدة على Supabase",
          body:
            "المصادقة ومعالجة البيانات المعتمدة على الخادم مبنية على خدمات Supabase، بما يشمل Supabase Auth مع استخدام PostgreSQL والتخزين الخاص من جهة الخلفية.",
        },
        {
          title: "السجلات التشغيلية والحماية",
          body:
            "تسجل المنصة أحداثاً تشغيلية وأمنية (مثل المصادقة والجلسات والرفع والتقييم والتصدير والتنظيف) لدعم الاعتمادية والمراجعة الإدارية. لا يوجد حالياً تكامل مع أدوات تتبع إعلانية في هذا الكود.",
        },
        {
          title: "حقوق المستخدم ووسيلة التواصل",
          body:
            "يمكنك طلب تصحيح البيانات أو الاطلاع عليها أو طلب المساعدة في الحذف عبر التواصل مع فريق المنصة من صفحة التواصل العامة.",
        },
      ],
      rightsTitle: "حقوق البيانات",
      rightsBody:
        "نراجع الطلبات المتعلقة ببيانات الحساب بجدية ونرد عبر وسيلة الدعم المتاحة في المنصة.",
      contactTitle: "الاستفسار عن سياسة الخصوصية",
      contactBody:
        "لأي استفسار أو طلب متعلق بالخصوصية، استخدم صفحة التواصل الرسمية حتى يصل طلبك للفريق عبر المسار الآمن المعتمد.",
      contactCta: "التواصل مع فريق المنصة",
    },
  },
};

export function getSiteContent(locale: Locale) {
  return SITE_CONTENT[locale];
}
