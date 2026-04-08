# Next.js Build Recovery Guide (Windows PowerShell)

## الهدف
هذا الدليل يساعدك على حل مشكلة تعليق البناء في Next.js (خصوصا عند مرحلة مثل `Finalizing page optimization`) من خلال تنظيف البيئة بشكل آمن وسريع قبل إعادة البناء.

## 1) أمر الطوارئ: إيقاف كل عمليات Node.js

```powershell
taskkill /f /im node.exe
```

## لماذا هذا الأمر مهم؟
عند تعليق عملية البناء، قد تبقى عمليات `node.exe` وعمليات الـ workers شغالة في الخلفية وتستهلك الذاكرة. إعادة تشغيل البناء بدون إنهائها غالبا يسبب:

- بطء شديد جدا
- تضارب/تزاحم بين عمليات البناء
- فشل البناء بسبب استهلاك الذاكرة

## 2) أمر احترافي موحد: تنظيف + تخصيص RAM + إعادة بناء

### نسخة عامة (أي مشروع Next.js)

```powershell
Stop-Process -Name "node" -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force .next, .turbo -ErrorAction SilentlyContinue; $env:NODE_OPTIONS="--max-old-space-size=16384"; npm run build
```

### نسخة مناسبة لهذا المشروع (workspace: @zootopia/web)

```powershell
Stop-Process -Name "node" -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force .next, .turbo, apps/web/.next, apps/web/.turbo -ErrorAction SilentlyContinue; $env:NODE_OPTIONS="--max-old-space-size=16384"; npm run build --workspace @zootopia/web
```

## شرح سريع للأمر الموحد

- `Stop-Process -Name "node"`: يغلق أي عملية Node.js عالقة.
- `Remove-Item ... .next, .turbo`: يحذف كاشات البناء القديمة أو التالفة.
- `$env:NODE_OPTIONS="--max-old-space-size=16384"`: يخصص 16GB RAM لعملية Node الحالية.
- `npm run build ...`: يبدأ بناء جديد من بيئة نظيفة.

## ملاحظات مهمة

- أمر `taskkill /f /im node.exe` يوقف كل تطبيقات Node.js المفتوحة (بما فيها سيرفرات تطوير أخرى).
- إذا كنت تشغل أكثر من مشروع في نفس الوقت، استخدم هذا الأمر بحذر.
- عند تكرار المشكلة، نفذ الأمر الموحد مرة واحدة قبل أي `build` جديد.