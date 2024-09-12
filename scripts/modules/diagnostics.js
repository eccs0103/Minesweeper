"use strict";

import { } from "../structure.js";
import { Stopwatch } from "./measures.js";

//#region Analyser
/**
 * Provides methods for analysing the code.
 */
class Analyser {
	/**
	 * @param {(...args: void[]) => unknown} action 
	 * @param {number} count 
	 * @returns {Promise<number>}
	 */
	static async benchmark(action, count = 1) {
		const stopwatch = new Stopwatch();
		for (let index = 0; index < count; index++) {
			stopwatch.launched = true;
			await action();
			stopwatch.launched = false;
		}
		return stopwatch.elapsed / count;
	}
}
//#endregion

export { Analyser };