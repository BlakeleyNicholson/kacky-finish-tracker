async function awaitWithTimeout(timeoutDuration, ...args) {
    function timeout() {
        return new Promise((res, rej) => {
            setTimeout(rej, timeoutDuration, new Error(`Timed out after ${timeoutDuration} ms`))
        });
    }
    return Promise.race([...args, timeout()]);
}

async function refreshTwitchToken(refreshToken, clientId, clientSecret) {
    let refreshHeaders = new Headers();
    refreshHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    let urlSearchParams = new URLSearchParams();
    urlSearchParams.append("client_id", clientId);
    urlSearchParams.append("client_secret", clientSecret);
    urlSearchParams.append("grant_type", "refresh_token");
    urlSearchParams.append("refresh_token", refreshToken);

    const refreshRequestOptions = {
        method: "POST",
        headers: refreshHeaders,
        body: urlSearchParams,
        redirect: "follow",
    }

    let refreshResponse = await fetch("https://id.twitch.tv/oauth2/token", refreshRequestOptions);

    return await refreshResponse.json();
}

async function createClip(ttvToken, clientId) {
    let requestHeaders = new Headers();
    requestHeaders.append("Authorization", `Bearer ${ttvToken}`);
    requestHeaders.append("Client-Id", clientId);

    const requestOptions = {
        method: "POST",
        headers: requestHeaders,
        redirect: "follow",
    }

    const broadcasterId = 92271663 // Wirtual broadcaster ID
    let clipResponse = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, requestOptions);

    return (await clipResponse.json()); // Returns {"id": <id>, "edit_url": <edit_url>}
}

async function getClipById(ttvToken, clientId, clipId) {
    let requestHeaders = new Headers();
    requestHeaders.append("Authorization", `Bearer ${ttvToken}`);
    requestHeaders.append("Client-Id", clientId);

    const requestOptions = {
        method: "GET",
        headers: requestHeaders,
        redirect: "follow",
    }

    // We need to await up to 15 seconds when getting the clip
    // If 15 seconds elapse without returning a clip, the clip failed to be created
    // We accomplish this through a race condition
    // console.log(`https://api.twitch.tv/helix/clips?id=${encodeURIComponent(clipId)}`);
    // const testClip = await fetch("https://api.twitch.tv/helix/clips?id=SpunkyPoisedWhaleDxCat-Y1W-1PlyS5itnUlq", requestOptions);
    // console.log(await testClip.json());

    let getClipPromise = new Promise(async (resolve) => {
        let clip = await fetch(`https://api.twitch.tv/helix/clips?id=${encodeURIComponent(clipId)}`, requestOptions);
        let clipJson = await clip.json();
        // console.log(clipJson["data"]);
        while (clipJson["data"].length === 0) {
            // console.log(clipJson["data"]);
            // console.log("equals blank array");
            clip = await fetch(`https://api.twitch.tv/helix/clips?id=${encodeURIComponent(clipId)}`, requestOptions);
            clipJson = await clip.json();
        }
        // console.log("resolving clipJson ");
        // console.log(clipJson);
        resolve(clipJson);
    });

    const clip = await awaitWithTimeout(15000, getClipPromise)
        .then(
            (value) => {
                return value;
            },
            (reason) => {
                console.error(reason);
                return null;
            }
        );

    return clip;
}

async function handleFinCheck(event, env, ctx) {
    const oldFinsText = await env.FINSTORE.get("WirtualTM");
    let oldFins = JSON.parse(oldFinsText);
    if (oldFins == null) {
        oldFins = {};
    }
    // console.log(oldFins);
    let newFins = await fetch("https://api.kacky.gg/event/WirtualTM/finned");
    let newFinsJson = await newFins.json();

    const oldFinnedMaps = Object.keys(oldFins);
    const newFinnedMaps = Object.keys(newFinsJson);

    // if (true) {
    if (oldFinnedMaps.length !== newFinnedMaps.length) {
        let unfinnedMap = "304"; // Default value for testing, should always be replaced with another

        for(const map of newFinnedMaps) {
            if (!oldFinnedMaps.includes(map)) {
                unfinnedMap = map;
                console.log(map);
            }
        }

        const ttvToken = await env.FINSTORE.get("TTV_Token");
        const clipInfo = await createClip(ttvToken, env.CLIENT_ID);
        console.log(clipInfo["data"][0]["id"]);
        const clip = await getClipById(ttvToken, env.CLIENT_ID, clipInfo["data"][0]["id"]);
        // console.log(clip);

        let content = `<@592916714639982592>\nWirtual finished ${unfinnedMap} at <t:${Math.floor(Date.now() / 1000)}:t>`

        if (clip) {
            content = content + `\n${clip["data"][0]["url"]}`
        }

        await env.FINSTORE.put("WirtualTM", JSON.stringify(newFinsJson));

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        // const formdata = new FormData();
        // formdata.append("content", unfinnedMap);
        const currentDate = new Date();
        const raw = JSON.stringify({
            "content": content,
            // "embeds": [
            //     {
            //         "title": "Wirtual finished a new kacky map!",
            //         "description": `Wirtual finished ${unfinnedMap} at <t:${Math.floor(Date.now()/1000)}:t>`,
            //         "color": 5814783
            //     }
            // ],
            "attachments": []
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        return fetch(
            `${env.WEBHOOK_URL}`,
            requestOptions
        );
    } else {
        console.log("finishes up to date");
        return new Response("finishes up to date");
    }
}

export default {
    async fetch(request, env, ctx) {
        const refreshedToken = await refreshTwitchToken(env.TWITCH_API_REFRESH_TOKEN, env.CLIENT_ID, env.CLIENT_SECRET);
        await env.FINSTORE.put("TTV_Token", refreshedToken["access_token"]);
        return new Response("Refreshed token");
    },

	async scheduled(event, env, ctx) {
        if (event.cron === "* */1 * * *") {
            console.log("Refreshing ttv token");
            // Process the hourly cron, i.e. refresh the TTV token
            const refreshedToken = await refreshTwitchToken(env.TWITCH_API_REFRESH_TOKEN, env.CLIENT_ID, env.CLIENT_SECRET);
            console.log(refreshedToken);
            console.log(refreshedToken["access_token"]);
            await env.FINSTORE.put("TTV_Token", refreshedToken["access_token"]);
        }

        // Now, we can perform the "minutely" cron, i.e. checking the fins
        return await handleFinCheck(event, env, ctx);
	}
};

