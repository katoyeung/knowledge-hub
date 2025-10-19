// Test script for CSV upload functionality
const fs = require("fs");
const path = require("path");

// Create a test CSV file with social media data
const testCsvData = `ID,Medium,Site,Thread Title,Post Message,Author Name,Channel,Post Date,Post Time,Thread Link,Comment Count,Share Count,View Count,Reaction Count,Like (reaction),Dislike (reaction),Angry (reaction),Haha (reaction),Love (reaction),Sad (reaction),Wow (reaction),Sentiment,Impact
7aa452382eb054fb7b6ef34b9771a10ae3179e7abbf352e8a1b2a193d806a9dd,Facebook,Facebook Page,"#特約分享 
【榮華月餅59折．中銀專屬限定優惠⚡】
正打算","#特約分享 
【榮華月餅59折．中銀專屬限定優惠⚡】
正打算要買月餅嘅你要留意啦📢榮華攜同中銀為你帶來超抵買月餅限定優惠🤩

由即日起至10月6日期間，憑中銀信用卡 / BoC Pay+ / 中銀卡用戶即可享以下優惠：
優惠1️⃣: 標準價59折優惠購買指定榮華月餅*
優惠2️⃣: 標準價$60購買孖裝冰皮月餅，可享買一送一優惠💕

用埋BoC Pay+付款💳，購買月餅滿$800（折實計），更可免費獲贈豬腳薑醋1包/禮券1張，用優惠價買月餅就最開心😘各位中銀客戶快啲嚟榮華分店提早入手心水月餅啦❤️

*優惠不適用於公益月餅券、中國月餅券、海外月餅券及「十二肖」月餅。
*優惠受條款及細則約束：詳情請向店鋪職員查詢或瀏覽中銀香港網頁>信用卡>推廣優惠。
提示：借定唔借？還得到先好借！

#香港榮華餅家 #WingWahHK #榮華月餅 #月餅 #月餅優惠 #中秋節",Metro Broadcast 新城廣播有限公司,Metro Broadcast 新城廣播有限公司,9/11/25,4:11:42 AM,https://www.facebook.com/metroradio.com.hk/posts/pfbid08VCBCoq8Knb5ZaykbYJ2C8ahtmpUoRzmQgUZcTpnLe8fa3R91BrwyhdR1jPmc5Tcl,0,1,0,4,4,0,0,0,0,0,0,0,0
04274f7ec6a17fc159c4f8658bbd852f85c84e0369d68d1858221d4bf3d67090,News,香港01,銀債來臨銀行定存加息戰激烈 恒生中短期全線加至2.3厘大行最高,當中恒生銀行更新特選客戶定存優惠，3個月、4個月及6個月定存息，全線上調統一至2.3厘，原初分別為2.1厘、2.1厘及2.2厘，加幅為0.2厘及0.1厘，均為大行中最高，當中4個月及6個月存息看齊中銀香港。至於一般客戶網上新資金優惠，3個月及6個月定存息也全線由1.9厘及2厘，上調0.2厘至2.1厘及2.2厘。 渣打銀行也將3個月及6個月定存息，由1.7厘及2厘，上調0.3厘及0.2厘，至2厘及2.2厘，而1年期定存息就繼續維持在2.2厘。,香港01,香港01,9/11/25,4:07:00 AM,https://www.hk01.com/%E8%B2%A1%E7%B6%93%E5%BF%AB%E8%A8%8A/60275418/%E9%8A%80%E5%82%B5%E4%BE%86%E8%87%A8%E9%8A%80%E8%A1%8C%E5%AE%9A%E5%AD%98%E5%8A%A0%E6%81%AF%E6%88%B0%E6%BF%80%E7%83%88-%E6%81%92%E7%94%9F%E4%B8%AD%E7%9F%AD%E6%9C%9F%E5%85%A8%E7%B7%9A%E5%8A%A0%E8%87%B32-3%E5%8E%98%E5%A4%A7%E8%A1%8C%E6%9C%80%E9%AB%98,0,0,0,0,0,0,0,0,0,0,0,0,0`;

// Write test CSV file
const testCsvPath = path.join(__dirname, "test-social-media-data.csv");
fs.writeFileSync(testCsvPath, testCsvData, "utf8");

console.log("✅ Test CSV file created:", testCsvPath);
console.log("📊 CSV contains 2 rows of social media data");
console.log("🔧 Ready for testing CSV upload with social_media_post connector");

// Instructions for testing
console.log("\n📋 Testing Instructions:");
console.log("1. Start the backend server: npm run dev:backend");
console.log("2. Start the frontend server: npm run dev:frontend");
console.log("3. Open the frontend and navigate to a dataset");
console.log('4. Click "Add Documents" and upload the test CSV file');
console.log('5. Select "Social Media Post" connector template');
console.log(
  "6. Verify that segments are created with proper content and metadata"
);
