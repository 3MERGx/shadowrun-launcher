/**
 * Activation key validator.
 *
 * Pure validation for entries inside `app/config/activationKeys.json`. Each
 * entry binds a single Microsoft product key to up to 15 PCIDs. The activate-
 * game IPC handler runs every entry through this function on load and aborts
 * activation with a user-facing error if any entry is malformed.
 *
 * No I/O, no logging, no IPC — returns an array of human-readable error
 * strings, empty when the entry is valid.
 */

/**
 * Validate a single activation key entry.
 *
 * @param {object} keyEntry The parsed JSON entry — expected shape:
 *   `{ id: number, name?: string, productKey: string, pcids: string[] }`.
 * @param {number} index Zero-based index of the entry inside
 *   `activationKeys.json`. Used to prefix error messages so the user can
 *   identify which row is broken (`Key 3: ...`).
 * @returns {string[]} Empty array when the entry is valid; otherwise one
 *   error string per problem found. The caller decides whether to surface a
 *   single combined error or list each one.
 */
function validateActivationKey(keyEntry, index) {
  const errors = [];

  if (typeof keyEntry.id !== "number") {
    errors.push(`Key ${index + 1}: 'id' must be a number`);
  }

  // `name` is optional metadata — only validate the type if it's present.
  if (keyEntry.name !== undefined && typeof keyEntry.name !== "string") {
    errors.push(`Key ${index + 1}: 'name' must be a string if provided`);
  }

  // Product key format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (case-insensitive,
  // alphanumeric). Anything else will be rejected by the helper anyway.
  if (!keyEntry.productKey || typeof keyEntry.productKey !== "string") {
    errors.push(
      `Key ${index + 1}: 'productKey' is required and must be a string`
    );
  } else if (
    !/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(
      keyEntry.productKey
    )
  ) {
    errors.push(
      `Key ${
        index + 1
      }: 'productKey' must follow format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`
    );
  }

  if (!keyEntry.pcids || !Array.isArray(keyEntry.pcids)) {
    errors.push(`Key ${index + 1}: 'pcids' must be an array`);
  } else {
    if (keyEntry.pcids.length === 0) {
      errors.push(`Key ${index + 1}: 'pcids' array cannot be empty`);
    } else if (keyEntry.pcids.length > 15) {
      // Hard cap of 15 PCIDs per key — Microsoft's online-activation servers
      // start refusing additional activations beyond that point.
      errors.push(
        `Key ${index + 1}: 'pcids' array cannot have more than 15 PCIDs (got ${
          keyEntry.pcids.length
        })`
      );
    }

    // PCID format: exactly 16 hex characters (8 bytes encoded). The product-
    // key tool emits this format; anything else means the entry was hand-
    // edited and will not match what the registry currently holds.
    keyEntry.pcids.forEach((pcid, pcidIndex) => {
      if (typeof pcid !== "string") {
        errors.push(
          `Key ${index + 1}, PCID ${pcidIndex + 1}: must be a string`
        );
      } else if (!/^[0-9A-Fa-f]{16}$/.test(pcid)) {
        errors.push(
          `Key ${index + 1}, PCID ${
            pcidIndex + 1
          }: must be exactly 16 hexadecimal characters (got: '${pcid}')`
        );
      }
    });

    const uniquePcids = [...new Set(keyEntry.pcids)];
    if (uniquePcids.length !== keyEntry.pcids.length) {
      errors.push(`Key ${index + 1}: contains duplicate PCIDs`);
    }
  }

  return errors;
}

module.exports = { validateActivationKey };
