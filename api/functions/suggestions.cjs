const { default: to } = require("await-to-js")

let ACCEPTED_COOKIES = [
    "DEVICE_INFO",
    "VISITOR_INFO1_LIVE",
    "GPS",
]

async function checkCookiesAndHandleConsent(page) {
    const currentCookies = await page.context().cookies();
    const isLoggedIn = currentCookies.some((cookie) => ACCEPTED_COOKIES.includes(cookie.name));

    if (!isLoggedIn) {
        let rejectCookies = await Promise.race([
            page.waitForSelector("#content > div.body.style-scope.ytd-consent-bump-v2-lightbox > div.eom-buttons.style-scope.ytd-consent-bump-v2-lightbox > div:nth-child(1) > ytd-button-renderer:nth-child(1) > yt-button-shape > button"),
            page.waitForSelector("xpath=/xpath/html/body/c-wiz/div/div/div/div[2]/div[1]/div[3]/div[1]/form[2]/div/div/button/div[1]"),
        ]).catch(reject)
        if (!rejectCookies) return;

        await Promise.all([
            page.waitForNavigation({ waitUntil: "load" }),
            rejectCookies.click(),
        ]).catch(reject)

        await page.waitForSelector(`#contents`);
    }
}

function clickVideoLink(page, videoInfo, scrollAmount) {
    return page.evaluate(({ videoInfo, scrollAmount }) => {
        return new Promise((resolve, reject) => {
            function getElementByXpath(path) {
                return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            }
    
            const start = Date.now() / 1000;
            const interval = setInterval(() => {
                const element = getElementByXpath(`//a[contains(@href,"${videoInfo.id}")]`);
                if (element) {
                    clearInterval(interval);
                    return resolve(element);
                }
    
                if (Date.now() / 1000 > start + scrollAmount) {
                    clearInterval(interval);
                    return resolve(false);
                }
    
                window.scrollBy(0, 800);
            }, 600);
        })
    }, { videoInfo, scrollAmount })
}

async function navigateToVideoPage(page, videoInfo, options) {
    const videoLinkXPath = `xpath=//a[contains(@href,"${videoInfo.id}")]`;
    const videoFound = await page.$(videoLinkXPath);

    if (videoFound) {
        await Promise.all([
            page.waitForNavigation(),
            videoFound.click(),
        ]);
        
        return true;
    }

    const [err, wasFound] = await to(clickVideoLink(page, videoInfo, options.scroll || 10));
    console.log(err, wasFound)

    if (err) {
        throw err;
    }

    if (wasFound) {
        await Promise.all([
            page.waitForNavigation(),
            wasFound.click(),
        ]);
        return !!wasFound;
    }

    return false;
}

function forceFindVideo(page, videoInfo) {
    return page.evaluate((videoInfo) => {
        const urlFormat = videoInfo.isShort ? "shorts/" : "watch?v=";
        const finalURL = `https://www.youtube.com/${urlFormat}${videoInfo.id}`;
        const urlDocuments = document.querySelectorAll("a");
        let chosen;

        for (const urlDocument of urlDocuments) {
            const url = urlDocument.href;
            if (!(url.includes("?watch?v=") || url.includes("/shorts"))) {
                urlDocument.href = finalURL;
                chosen = urlDocument;
                break;
            }
        }

        chosen.click();
    }, videoInfo)
}

async function main(pageContainer, options) {
    const videoInfo = pageContainer.videoInfo;
    const page = pageContainer.page;

    await page.goto(`https://www.youtube.com/`, { waitUntil: "networkidle" })
    await page.waitForSelector(`#contents`)

    await checkCookiesAndHandleConsent(page);

    if (options.forceFind) {
        try {
            await Promise.all([
                page.waitForNavigation(),
                forceFindVideo(page, videoInfo),
            ]);

            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    return await navigateToVideoPage(page, videoInfo, options);
}

module.exports = main