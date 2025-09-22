Awesome — let’s add your second event as a new tab.

# Step 4 — Add the “XXXX” event and show multiple tabs

## 4.1 Create the new event data file

Create:

```
/202507_china/data/event-20250723-xxxx.js
```

Paste this starter (you can add the rest later — this is just to verify the tab works):

```js
// /202507_china/data/event-20250723-xxxx.js
window.GALLERY_ITEMS = [
  { name: "20250723_135203.jpg", preview: "https://drive.google.com/file/d/1cT_Tv0wLmybKZ_x5bL_HqD3x3iOSqqcj/preview?authuser=0", desc: "Ухан — кадър 135203." },
  { name: "20250723_135206.jpg", preview: "https://drive.google.com/file/d/14WD4YV9qprERkHeShTxvHqvkobYCl16L/preview?authuser=0", desc: "Ухан — кадър 135206." },
  { name: "20250723_135211.mp4", preview: "https://drive.google.com/file/d/1xwnUFigulyIL6RHLWxm9QJF6ltUEDR_R/preview?authuser=0", desc: "Ухан — видео 135211." },
  { name: "20250723_135349.jpg", preview: "https://drive.google.com/file/d/1n-78ePSzegSSa9jbR9HFS76IXNNESoDV/preview?authuser=0", desc: "Ухан — кадър 135349." },
  { name: "20250723_135858.mp4", preview: "https://drive.google.com/file/d/1IetnIIiQ0UtEfd3G4ZCVLDsfDZk7RK4F/preview?authuser=0", desc: "Ухан — видео 135858." }
];
```

> Later, just extend this array with all your xxxx items in the same `{ name, preview, desc }` format.

---

## 4.2 Register the event in the index

Open:

```
/202507_china/data/events.js
```

Change it from one entry to two (append the second line):

```js
// /202507_china/data/events.js
window.GALLERY_EVENT_INDEX = [
  { slug: "20250723-ichan", title: "Ичан · 23 юли 2025", data: "data/event-20250723-ichan.js" },
  { slug: "20250723-xxxx", title: "xxxx · 23 юли 2025", data: "data/event-20250723-xxxx.js" }
];
```

---

# Google Script

-- Start of the script --

/* function generateImageEmbedsFromFolder() {
  const folderId = '1EEPx1hJlbqbdruIdysMz_yZqOcVZD3BG';  // Replace with your folder ID
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  let output = "";

  while (files.hasNext()) {
    const file = files.next();
    // Make file publicly accessible
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // Output URL in requested format
    output += 'https://drive.google.com/file/d/' + file.getId() + '/preview?authuser=0 \n\n';
  }

  Logger.log(output);
}
*/

function generatePreviewUrlsFromFolder() {

// За повторно включване:
// 20250719_Китай_полет_Шанхай: https://drive.google.com/drive/folders/1U3drYNPb1I60ZGYBpX-Rv9g9ycXDy1cM?usp=sharing
// 20250721_01_Шанхай_храм_Нефритеният_Буда: https://drive.google.com/drive/folders/1NBHuKi2yRR-aBQ_58YqFJuiSTAkHbet0?usp=sharing
// 20250721_02 Шанхай фабрика за коприна: https://drive.google.com/drive/folders/1-6d8gajrjacKVAKau6qfgNIVgv2bXtLa?usp=sharing
// 20250721_03 Шанхай френската концесия: https://drive.google.com/drive/folders/1PxaR0Oao2Vym9zf_J3GgITEbIdKCPwv4?usp=sharing
// 20250721_04 Разходка в Шанхай: https://drive.google.com/drive/folders/1IpCj2EuVdH8mROtt-UfuXRngcu8t33En?usp=sharing
// 20250721_05 Шанхай - инсталация на Луи Вюитон: https://drive.google.com/drive/folders/1WbfyLreAkHJFCSwZTsVA_iRRs_O1BsfW?usp=sharing
// 20250721_06 Шанхай - разходка с корабче по река Хуанпу: https://drive.google.com/drive/folders/1EEPx1hJlbqbdruIdysMz_yZqOcVZD3BG?usp=drive_link
// 20250722_01 Шанхайската кула : https://drive.google.com/drive/folders/1XWddiFcZRCpAayt6Z6lzfJBJsNJSu48I?usp=drive_link
// 20250722_02 Шанхай градините Ю Юан: https://drive.google.com/drive/folders/1cBAtW3geXOSmaeKaxdJC9iz3-sDMYWCR?usp=drive_link
// 20250722_03 Джуджаджао: https://drive.google.com/drive/folders/1HgENDQ4mykj55Xe124h0cjLumw5Gsm0w?usp=sharing

// Готови:
 // 20250722_04 Акробатично шоу: https://drive.google.com/drive/folders/1oSz2Cr5x_iwsUT5rWRn25-yUjdwF5J2Q?usp=sharing
 // 20250723 Високоскоростен влак до Ичан: https://drive.google.com/drive/folders/1x1i4pXZMHVlYp9OsZeyFRC6WyRCaVhBi?usp=sharing
 // 20250723 Ухан: https://drive.google.com/drive/folders/1px5krfNXteeq-v7CUpkPTNUlPW1BsAxz?usp=sharing


// Текущ:
 // 20250724_08 Племето Туджа от народа Ба: https://drive.google.com/drive/folders/1UYgtkPGUOnHV0WDjulll9ucxrq_gAX0F?usp=sharing

// Оставащи:

 // 20250724_14 Язовир Трите клисури: https://drive.google.com/drive/folders/1hAVYEWPJsVya94T-pWUba9BDCCxZjkJb?usp=sharing
 // 20250724_21 Вечер на кораба: https://drive.google.com/drive/folders/1UBdNBmcQ1Sp6LdQjps3rLx-h-WgO0ZcN?usp=sharing
 // 20250725_08 Яндзъ разходка с корабче: https://drive.google.com/drive/folders/15WNEcl2PZVVN7LTvlWHvDqtQrKKDGKuB?usp=sharing
 // 20250725_10 Из корабчето: https://drive.google.com/drive/folders/1evR4xzg81bFVhz3pKjNUF1QNkAtaMRw-?usp=sharing
 // 20250725_11 Яндзъ: https://drive.google.com/drive/folders/1F6moIByH8LMbZ2ua0oQBuR-YruhjKgIs?usp=sharing
 // 20250725_13 Яндзъ през клисурата: https://drive.google.com/drive/folders/1ApngfZCbe6Z51IJQFaQLpkxAtQXh6IAL?usp=sharing
 // 20250725_15 Белият Император: https://drive.google.com/drive/folders/1yV_IbDK6nxiGt-X5bEo7ItuhdnjBElFC?usp=sharing
 // 20250725_20 Вечерно шоу: https://drive.google.com/drive/folders/1SdcoagzNyrL3kYEbrummPzg62ol6s1o1?usp=sharing
 // 20250726_07 На кораба: https://drive.google.com/drive/folders/1muOPNDh_ns_9F5b3JHxL5-BLts1X6Lp_?usp=sharing
 // 20250726_08 Снимки от корабни фотографи за стая 223: https://drive.google.com/drive/folders/1X47D48AF0OeAkXb0fgB2SKWozZAVQ2vu?usp=sharing
 // 20250726_08 三峡照 - Снимки от Трите клисури: https://drive.google.com/drive/folders/1xdmJ1__iLCk5nZmI7cy6DxUNQD6Z55Mi?usp=sharing
 // 20250726_09 Фенгду - Xiaoguanshan фолклорен парк: https://drive.google.com/drive/folders/17MWnCXBDAZHRa3fw9G9gUeazCaKMwoNV?usp=sharing
 // 20250726_11 Каньона Вулинг: https://drive.google.com/drive/folders/1eJzRNAZl0L02MFct_UDH-KTbfLKaSKbH?usp=sharing
 // 20250727_08 Чинцин зоологическа градина: https://drive.google.com/drive/folders/1bBuDjUxdMsy0cizrtqNaQCDQEpVGbpNo?usp=sharing
 // 20250727_12 Влак стрела: https://drive.google.com/drive/folders/1JeuwdtSs9tpW9GlCTZTS63V2mbRLEekl?usp=sharing
 // 20250727_17 Сиан пристигане: https://drive.google.com/drive/folders/1R542GBlFu8CHpFiDwBWRHgTwqBRmGFSr?usp=sharing
 // 20250727_21 Сиан улицата на традициите: https://drive.google.com/drive/folders/1wcdJRnFY2Y7QTdHrlgnELPq9Usk9lIbP?usp=sharing
 // 20250728_10 Сиан Фабрика Нефрит и Теракота: https://drive.google.com/drive/folders/1CaC8ngaA6_CRxHh64QpzaOG2Uqf3jl8d?usp=sharing
 // 20250728_13 Сиан Теракотена армия: https://drive.google.com/drive/folders/1IVY26IstxjbLSZ5KK9Vuaiis8w8VPPJq?usp=sharing
 // 20250728_17 Сиан разходка край крепостната стена: https://drive.google.com/drive/folders/1tZOGc12VcoAu8fzzmKYSJXN8-t0Tj9Fh?usp=sharing
 // 20250728_19 Сиан ЖП гара и нощен влак: https://drive.google.com/drive/folders/1NpLRbPyY0aPcyBsZcT44R6LqFQI3n_Pl?usp=sharing
 // 20250729_08 Пекин пристигане: https://drive.google.com/drive/folders/1MDKbsz7-0ut9XdTC-E7CAqZM42-FY3gH?usp=sharing
 // 20250729_11 Пекин чаена церемония: https://drive.google.com/drive/folders/1SpXiiiyfysjFsLkYrbsh3ovkARBmEp_T?usp=sharing
 // 20250729_13 Площад Тянънмън: https://drive.google.com/drive/folders/14UYTVKEt0ouT3U0oxW-4IZ70-lOAN5l3?usp=sharing
 // 20250729_16 Летния дворец: https://drive.google.com/drive/folders/16juvXp3io8cE5Gn6AyCM10z_PWGlfmwC?usp=sharing
 // 20250730_10 Забранения град: https://drive.google.com/drive/folders/1skCiBibWKBXwgHemTAX0sa8EFPNpyiDQ?usp=sharing
 // 20250730_14 Фабрика за перли: https://drive.google.com/drive/folders/1M-BtpdITFInvqgTYreHxwziFjYyjCNw8?usp=sharing
 // 20250730_15 Олимпийския стадион: https://drive.google.com/drive/folders/1hE9w3uuiIwkAez0sqjx0YQrbHidBs7bx?usp=sharing
 // 20250730_19 Пекин нощна разходка в старият град: https://drive.google.com/drive/folders/1w1e6xY26xKg8AnBPtg2BrR9cKblsQlRL?usp=sharing
 // 20250731_10 Великата китайска стена: https://drive.google.com/drive/folders/1l-gG2gu0JeSfQZ1N38D9rA4rSElB_fpz?usp=sharing
 // 20250731_13 Храма на небето: https://drive.google.com/drive/folders/1gWyio4GvdETL9GKUsW7LKrc0cLhN12GR?usp=sharing
 // 20250731_17 Водно шоу: https://drive.google.com/drive/folders/1YbAwgIWkshoOAeDFF3OTo82Qc4TjCIUL?usp=sharing
 // 20250731_18 Патица по пекински: https://drive.google.com/drive/folders/1TdnqVZ-z-seeMyCG6x_Lw_gFEhDJIdGv?usp=sharing
 // 

  const folderId = '1UYgtkPGUOnHV0WDjulll9ucxrq_gAX0F'; // <-- replace
  const PAGE_SIZE = 50;  // lines per run
  const PAGE = 2;         // 0-based: set 0, then 1, 2, ...

  const folder = DriveApp.getFolderById(folderId);

  // Collect + sort
  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() === 'application/vnd.google-apps.shortcut') continue;
    files.push(f);
  }
  files.sort((a, b) => a.getName().localeCompare(b.getName(), undefined, { numeric: true }));

  // Slice for this page
  const start = PAGE * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, files.length);
  if (start >= files.length) {
    Logger.log(`No items for PAGE=${PAGE}. Total files: ${files.length}`);
    return;
  }

  const out = [];
  for (let i = start; i < end; i++) {
    const file = files[i];
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = 'https://drive.google.com/file/d/' + file.getId() + '/preview?authuser=0';
    out.push(file.getName() + ' = "' + url + '";');
  }

  Logger.log(out.join('\n'));
  Logger.log(`-- Page ${PAGE} of ${Math.ceil(files.length / PAGE_SIZE) - 1}; files ${start + 1}-${end} of ${files.length} --`);

}

-- End of the script --
