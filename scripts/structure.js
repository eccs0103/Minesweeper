"use strict";

import { Queue } from "../scripts/modules/extensions.js";
import { Random } from "../scripts/modules/generators.js";
import { Matrix, Point, Point2D } from "../scripts/modules/measures.js";
import { } from "../scripts/modules/palette.js";
import { } from "../scripts/modules/storage.js";

const { trunc } = Math;

//#region Privacy
/**
 * Enum for field privacy.
 * @enum {number}
 */
const Privacy = {
	/**
	 * Opened field
	 * @readonly
	 */
	opened: 0,
	/**
	 * Closed, unmarked field
	 * @readonly
	 */
	unmarked: 1,
	/**
	 * Closed field, marked as mine
	 * @readonly
	 */
	marked: 2,
	/**
	 * Closed field, marked as unknown
	 * @readonly
	 */
	unknown: 3,
};
Object.freeze(Privacy);
//#endregion
//#region Field
/**
 * Represents a field with or without mine.
 */
class Field {
	/**
	 * @param {number} danger The danger level of the field.
	 * @throws {TypeError} If the danger is not an integer.
	 * @throws {RangeError} If the danger is out of range.
	 */
	constructor(danger) {
		if (!Number.isInteger(danger)) throw new TypeError(`The danger ${danger} must be finite integer number`);
		if (0 > danger || danger > Board.peakDanger) throw new RangeError(`The danger ${danger} is out of range [0 - ${Board.peakDanger}]`);
		this.#danger = danger;
	}
	/** @type {number} */
	#danger;
	/**
	 * Gets the danger level of the field.
	 * @readonly
	 * @returns {number}
	 * @throws {EvalError} If the field is not opened.
	 */
	get danger() {
		if (this.#privacy !== Privacy.opened) throw new EvalError(`Unable to read danger of closed field`);
		return this.#danger;
	}
	/** @type {Privacy} */
	#privacy = Privacy.unmarked;
	/**
	 * Gets the privacy state of the field.
	 * @returns {Privacy}
	 */
	get privacy() {
		return this.#privacy;
	}
	/**
	 * Sets the privacy state of the field.
	 * @param {Privacy} value 
	 * @returns {void}
	 * @throws {EvalError} If trying to open a field that contains a mine.
	 */
	set privacy(value) {
		if (this.#privacy === Privacy.opened) return;
		this.#privacy = value;
		if (value === Privacy.opened && this.#danger === Board.peakDanger) throw new EvalError(`The field blew up`);
	}
	/**
	 * Returns a string representation of a field.
	 * @returns {string}
	 */
	toString() {
		switch (this.#privacy) {
			case Privacy.opened: return (this.#danger < Board.peakDanger
				? `Opened ${this.#danger} field`
				: `Opened mine`
			);
			case Privacy.unmarked: return `Closed, unmarked field`;
			case Privacy.marked: return `Closed field, marked as mine`;
			case Privacy.unknown: return `Closed field, marked as unknown`;
			default: throw new TypeError(`Invalid privacy ${this.#privacy} state`);
		}
	}
}
//#endregion
//#region Outcome options
/**
 * @enum {boolean?}
 */
const OutcomeOptions = {
	/**
	 * @readonly
	 */
	undefined: null,
	/**
	 * @readonly
	 */
	victory: true,
	/**
	 * @readonly
	 */
	defeat: false,
};
Object.freeze(OutcomeOptions);
//#endregion
//#region Board
/**
 * @typedef {Queue<Readonly<Point2D>>} Area
 */

/**
 * Represents the game board.
 */
class Board {
	/** @type {Point2D[]} */
	static #perimeter = [
		new Point2D(-1, -1),
		new Point2D(0, -1),
		new Point2D(1, -1),
		new Point2D(-1, 0),
		new Point2D(1, 0),
		new Point2D(-1, 1),
		new Point2D(0, 1),
		new Point2D(1, 1),
	];
	/**
	 * Gets the peak value of the danger in the board.
	 * @readonly
	 * @returns {number}
	 */
	static get peakDanger() {
		return Board.#perimeter.length + 1;
	}
	/**
	 * Checks if the given size and mine count are compatible with the game board.
	 * @param {Readonly<Point2D>} size The size of the board.
	 * @param {number} count The number of mines.
	 * @returns {boolean} True if the size and mine count are compatible, otherwise false.
	 * @throws {TypeError} If the x or y coordinate of the size is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the size is less than 1.
	 * @throws {RangeError} If the number of fields is less than the peak value of the danger in the board.
	 * @throws {TypeError} If count is not a finite integer.
	 * @throws {RangeError} If count is less than 0.
	 */
	static areCompatible(size, count) {
		if (!Point.isInteger(size)) throw new TypeError(`The size ${size} must be finite integer point`);
		if (1 > size.x || 1 > size.y) throw new RangeError(`The size ${size} is out of range [(1, 1) - (+∞, +∞))`);
		const surface = size.x * size.y;
		const maxCount = surface - Board.peakDanger;
		if (maxCount < 0) throw new RangeError(`With current perimeter the board must have minimum ${Board.peakDanger} fields`);

		if (!Number.isInteger(count)) throw new TypeError(`The count ${count} must be finite integer number`);
		if (count < 0) throw new RangeError(`The count ${count} is out of range [0 - +∞)`);
		return (count <= maxCount);
	}
	/**
	 * Creates a board with the given size and mine count.
	 * @param {Readonly<Point2D>} size The size of the board.
	 * @param {number} count The number of mines.
	 * @throws {TypeError} If the x or y coordinate of the size is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the size is less than 1.
	 * @throws {RangeError} If the number of fields is less than the peak value of the danger in the board.
	 * @throws {TypeError} If count is not a finite integer.
	 * @throws {RangeError} If count is less than 0 or greater than the number of fields.
	 */
	constructor(size, count) {
		if (!Point.isInteger(size)) throw new TypeError(`The size ${size} must be finite integer point`);
		if (1 > size.x || 1 > size.y) throw new RangeError(`The size ${size} is out of range [(1, 1) - (+∞, +∞))`);
		const surface = size.x * size.y;
		const maxCount = surface - Board.peakDanger;
		if (maxCount < 0) throw new RangeError(`With current perimeter the board must have minimum ${Board.peakDanger} fields`);
		this.#size = size;

		if (!Number.isInteger(count)) throw new TypeError(`The count ${count} must be finite integer number`);
		if (count < 0 || count > maxCount) throw new RangeError(`The count ${count} is out of range [0 - ${maxCount}]`);
		this.#count = count;

		this.#matrix = new Matrix(size, () => new Field(0));
		this.#isInitialized = false;
		this.#modifications = new Queue();
		this.#outcome = OutcomeOptions.undefined;
		this.#counter = surface - count;
	}
	/** @type {Readonly<Point2D>} */
	#size;
	/**
	 * Gets the size of the board.
	 * @readonly
	 * @returns {Readonly<Point2D>}
	 */
	get size() {
		return this.#size;
	}
	/**
	 * @param {Readonly<Point2D>} position 
	 * @returns {Point2D[]}
	 */
	#getPerimetersAt(position) {
		const size = this.#size;
		const result = [];
		for (const offset of Board.#perimeter) {
			const location = position["+"](offset);
			if (0 > location.x || location.x >= size.x || 0 > location.y || location.y >= size.y) continue;
			result.push(location);
		}
		return result;
	}
	/** @type {number} */
	#count;
	/**
	 * Gets the number of mines.
	 * @readonly
	 * @returns {number}
	 */
	get count() {
		return this.#count;
	}
	/** @type {number} */
	#counter;
	/**
	 * @param {Readonly<Point2D>} point 
	 * @returns {number}
	 */
	#toNumber(point) {
		const size = this.#size;
		return point.y * size.x + point.x;
	}
	/**
	 * @param {number} number 
	 * @returns {Point2D}
	 */
	#toPoint(number) {
		const size = this.#size;
		return new Point2D(number % size.x, trunc(number / size.x));
	}
	/** @type {Matrix<Field>} */
	#matrix;
	/**
	 * Gets the state at the specified position.
	 * @param {Readonly<Point2D>} position The position of the field.
	 * @returns {number}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	getStateAt(position) {
		const field = this.#matrix.get(position);
		switch (field.privacy) {
			case Privacy.opened: return field.danger;
			case Privacy.unmarked: return -1;
			case Privacy.marked: return -2;
			case Privacy.unknown: return -3;
			default: throw new TypeError(`Invalid privacy ${field.privacy} state for field at ${position}`);
		}
	}
	/** @type {boolean} */
	#isInitialized;
	/**
	 * @param {Readonly<Point2D>} position 
	 * @returns {void}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	#initialize(position) {
		if (this.#isInitialized) return;
		const size = this.#size;
		const count = this.#count;
		const random = Random.global;

		const indices = new Set(Array(size.x * size.y).keys());
		indices.delete(this.#toNumber(position));
		for (const location of this.#getPerimetersAt(position)) {
			indices.delete(this.#toNumber(location));
		}
		const mines = random.subarray(Array.from(indices), count).map(field => this.#toPoint(field));

		/** @type {Map<number, number>} */
		const map = new Map();
		for (const mine of mines) {
			const index = this.#toNumber(mine);
			map.set(index, NaN);
			for (const location of this.#getPerimetersAt(mine)) {
				const index = this.#toNumber(location);
				map.set(index, (map.get(index) ?? 0) + 1);
			}
		}

		const matrix = this.#matrix;
		for (const [index, danger] of map) {
			const position = this.#toPoint(index);
			matrix.set(position, new Field(Number.isNaN(danger)
				? Board.peakDanger
				: danger
			));
		}
		this.#isInitialized = true;
	}
	/** @type {Queue<Area>} */
	#modifications;
	/**
	 * Gets the queue of modificated areas.
	 * @readonly
	 * @returns {Queue<Area>}
	 */
	get modifications() {
		return this.#modifications;
	}
	/** @type {OutcomeOptions} */
	#outcome;
	/**
	 * Gets the current outcome of the game.
	 * @readonly
	 * @returns {OutcomeOptions}
	 */
	get outcome() {
		return this.#outcome;
	}
	/**
	 * @param {OutcomeOptions} option 
	 * @returns {void}
	 */
	#setDefinedOutcome(option) {
		if (option === OutcomeOptions.undefined) return;
		this.#outcome = option;
	}
	/**
	 * @returns {void}
	 */
	#onSuspend() {
		const area = new Queue();
		const size = this.#size;
		for (let x = 0; x < size.x; x++) {
			for (let y = 0; y < size.y; y++) {
				const position = new Point2D(x, y);
				const field = this.#matrix.get(position);
				if (field.privacy === Privacy.opened) continue;
				this.#tryOpenField(field);
				area.push(position);
			}
		}
		this.#modifications.push(area);
	}
	/**
	 * @param {Readonly<Point2D>} size 
	 * @param {number} count 
	 */
	resize(size, count) {
		if (!Point.isInteger(size)) throw new TypeError(`The size ${size} must be finite integer point`);
		if (1 > size.x || 1 > size.y) throw new RangeError(`The size ${size} is out of range [(1, 1) - (+∞, +∞))`);
		const surface = size.x * size.y;
		const maxCount = surface - Board.peakDanger;
		if (maxCount < 0) throw new RangeError(`With current perimeter the board must have minimum ${Board.peakDanger} fields`);
		this.#size = size;

		if (!Number.isInteger(count)) throw new TypeError(`The count ${count} must be finite integer number`);
		if (count < 0 || count > maxCount) throw new RangeError(`The count ${count} is out of range [0 - ${maxCount}]`);
		this.#count = count;

		this.#matrix = new Matrix(size, () => new Field(0));
		this.#isInitialized = false;
		this.#modifications = new Queue();
		this.#outcome = OutcomeOptions.undefined;
		this.#counter = surface - count;
	}
	/**
	 * Rebuilds the board, resetting all fields.
	 * @returns {void}
	 */
	rebuild() {
		const size = this.#size;
		const count = this.#count;

		this.#matrix = new Matrix(size, () => new Field(0));
		this.#isInitialized = false;
		this.#modifications.clear();
		this.#outcome = OutcomeOptions.undefined;
		this.#counter = size.x * size.y - count;
	}
	/**
	 * @param {Field} field 
	 * @returns {boolean}
	 */
	#tryOpenField(field) {
		try {
			field.privacy = Privacy.opened;
			return true;
		} catch (error) {
			if (!(error instanceof EvalError)) throw error;
			if (error.message !== `The field blew up`) throw error;
			return false;
		}
	}
	/**
	 * @param {Readonly<Point2D>} position 
	 * @param {Area} area 
	 * @returns {void}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	#openFieldAtComplement(position, area) {
		this.#initialize(position);
		const field = this.#matrix.get(position);
		if (field.privacy !== Privacy.unmarked) return;
		if (!this.#tryOpenField(field)) this.#setDefinedOutcome(OutcomeOptions.defeat);
		this.#counter--;
		area.push(position);
		if (field.danger === 0) {
			for (const location of this.#getPerimetersAt(position)) {
				this.#openFieldAtComplement(location, area);
			}
		}
		if (this.#counter <= 0) this.#setDefinedOutcome(OutcomeOptions.victory);
	}
	/**
	 * Opens the field at the specified position.
	 * @param {Readonly<Point2D>} position The position of the field.
	 * @returns {void}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	digFieldAt(position) {
		const area = new Queue();
		this.#openFieldAtComplement(position, area);
		this.#modifications.push(area);
		if (this.#outcome !== OutcomeOptions.undefined) this.#onSuspend();
	}
	/**
	 * Marks the field at the specified position.
	 * @param {Readonly<Point2D>} position The position of the field.
	 * @returns {void}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	markFieldAt(position) {
		const area = new Queue();
		const field = this.#matrix.get(position);
		if (field.privacy === Privacy.opened) return;
		field.privacy = (/** @type {Privacy} */ (trunc(field.privacy % 3) + 1));
		area.push(position);
		this.#modifications.push(area);
	}
	/**
	 * @param {Readonly<Point2D>} position 
	 * @returns {void}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	digPerimeterAt(position) {
		const area = new Queue();
		const field = this.#matrix.get(position);
		if (field.privacy !== Privacy.opened) return;
		let marks = 0;
		const unmarked = [];
		for (const location of this.#getPerimetersAt(position)) {
			const neighbour = this.#matrix.get(location);
			switch (neighbour.privacy) {
				case Privacy.marked:
				case Privacy.unknown: marks++;
				case Privacy.opened: break;
				default: unmarked.push(location); break;
			}
		}
		if (marks !== field.danger) return;
		for (const location of unmarked) {
			this.#openFieldAtComplement(location, area);
		}
		this.#modifications.push(area);
		if (this.#outcome !== OutcomeOptions.undefined) this.#onSuspend();
	}
};
//#endregion
//#region Settings
/**
 * @typedef {Object} SettingsNotation
 * @property {number} [boardWidth]
 * @property {number} [boardHeight]
 * @property {number} [minesCount]
 * @property {boolean} [fixRatio]
 * @property {boolean} [invertedControl]
 */

class Settings {
	/**
	 * @param {unknown} source 
	 * @returns {Settings}
	 */
	static import(source, name = `source`) {
		try {
			const shell = Object.import(source);
			const result = new Settings();
			if (`boardWidth` in shell && `boardHeight` in shell) {
				const boardWidth = Number.import(shell[`boardWidth`], `property boardWidth`);
				const boardHeight = Number.import(shell[`boardHeight`], `property boardHeight`);
				const boardSize = Object.freeze(new Point2D(boardWidth, boardHeight));
				if (!Point.isInteger(boardSize)) throw new TypeError(`The size ${boardSize} must be finite integer point`);
				if (boardSize.x < 1 || boardSize.y < 1) throw new RangeError(`The size ${boardSize} is out of range [(1, 1) - (+∞, +∞))`);
				result.boardSize = boardSize;
			}
			if (`minesCount` in shell) {
				const minesCount = Number.import(shell[`minesCount`], `property minesCount`);
				if (!Number.isInteger(minesCount)) throw new TypeError(`The mines count ${minesCount} must be finite integer number`);
				if (minesCount < 0) throw new RangeError(`The mines count ${minesCount} is out of range [0 - +∞)`);
				result.minesCount = minesCount;
			}
			if (`fixRatio` in shell) {
				result.fixRatio = Boolean.import(shell[`fixRatio`], `property fixRatio`);
			}
			if (`invertedControl` in shell) {
				result.invertedControl = Boolean.import(shell[`invertedControl`], `property invertedControl`);
			}
			return result;
		} catch (error) {
			throw new TypeError(`Unable to import ${(name)} due its ${typename(source)} type`, { cause: error });
		}
	}
	/**
	 * @returns {SettingsNotation}
	 */
	export() {
		return {
			boardWidth: this.boardSize.x,
			boardHeight: this.boardSize.y,
			minesCount: this.minesCount,
			fixRatio: this.fixRatio,
			invertedControl: this.invertedControl,
		};
	}
	/** @type {Readonly<Point2D>} */
	#boardSize = Object.freeze(Point2D.fill(9));
	/**
	 * @returns {Readonly<Point2D>}
	 */
	get boardSize() {
		return this.#boardSize;
	}
	/**
	 * @param {Readonly<Point2D>} value 
	 * @returns {void}
	 */
	set boardSize(value) {
		if (!Board.areCompatible(value, this.#minesCount)) throw new RangeError(`Size ${value} is too small for count ${this.#minesCount}. It must contain minimum ${this.#minesCount + Board.peakDanger} fields`);
		this.#boardSize = value;
	}
	/** @type {number} */
	#minesCount = 10;
	/**
	 * @returns {number}
	 */
	get minesCount() {
		return this.#minesCount;
	}
	/**
	 * @param {number} value 
	 * @returns {void}
	 */
	set minesCount(value) {
		if (!Board.areCompatible(this.#boardSize, value)) throw new RangeError(`Count ${value} is too large for size ${this.#boardSize}. It can contain maximum ${this.#boardSize.x * this.#boardSize.y - Board.peakDanger} mines`);
		this.#minesCount = value;
	}
	/**
	 * @param {Readonly<Point2D>} size 
	 * @param {number} count 
	 */
	resize(size, count) {
		if (!Board.areCompatible(size, count)) throw new RangeError(`Mines count ${count} is not compatible board size ${size}. Use greater board size or less mines count`);
		this.#boardSize = size;
		this.#minesCount = count;
	}
	/** @type {boolean} */
	#fixRatio = true;
	/**
	 * @returns {boolean}
	 */
	get fixRatio() {
		return this.#fixRatio;
	}
	/**
	 * @param {boolean} value 
	 * @returns {void}
	 */
	set fixRatio(value) {
		this.#fixRatio = value;
	}
	/** @type {boolean} */
	#invertedControl = true;
	/**
	 * @returns {boolean}
	 */
	get invertedControl() {
		return this.#invertedControl;
	}
	/**
	 * @param {boolean} value 
	 * @returns {void}
	 */
	set invertedControl(value) {
		this.#invertedControl = value;
	}
}
//#endregion

export { Privacy, Field, OutcomeOptions, Board, Settings };