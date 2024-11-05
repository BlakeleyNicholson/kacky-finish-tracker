export default {
	/**
	 * @param {Request} request
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async scheduled(request, env, ctx) {
		const oldFinsText = await env.FINSTORE.get("WirtualTM");
		let oldFins = JSON.parse(oldFinsText);
		if (oldFins == null) {
			oldFins = {};
		}
		console.log(oldFins);
		let newFins = await fetch("https://api.kacky.gg/event/WirtualTM/finned");
		let newFinsJson = await newFins.json();

		const oldFinnedMaps = Object.keys(oldFins);
		const newFinnedMaps = Object.keys(newFinsJson);

		if (oldFinnedMaps.length != newFinnedMaps.length) {
			let unfinnedMap = "none";

			for(const map of newFinnedMaps) {
				if (!oldFinnedMaps.includes(map)) {
					unfinnedMap = map;
					console.log(map);
				}
			}

			await env.FINSTORE.put("WirtualTM", JSON.stringify(newFinsJson));

			const myHeaders = new Headers();
			myHeaders.append("Content-Type", "application/json");

			// const formdata = new FormData();
			// formdata.append("content", unfinnedMap);
			const currentDate = new Date();
			const raw = JSON.stringify({
				"content": "<@592916714639982592>",
				"embeds": [
				  {
					"title": "Wirtual finished a new kacky map!",
					"description": `Wirtual finished ${unfinnedMap} at <t:${Math.floor(Date.now()/1000)}:t>`,
					"color": 5814783
				  }
				],
				"attachments": []
			});

			const requestOptions = {
				method: "POST",
				headers: myHeaders,
				body: raw,
				redirect: "follow"
			};

			console.log(env.WEBHOOK_URL)

			return fetch(
				`${env.WEBHOOK_URL}`,
				requestOptions
			);
		} else {
			return new Response("up to date");
		}
	}
};
