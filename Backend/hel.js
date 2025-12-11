// ===============================
//  HELP CHAT LOCAL STORAGE MIGRATION
// ===============================

(function migrateHelpStorage() {
  const NEW_KEY = "seha_help_map";

  // If new key already exists, no migration needed
  if (localStorage.getItem(NEW_KEY)) return;

  let migrated = {};

  // 1. Detect old keys — adjust these names if you used different ones
  const OLD_KEYS = [
    "help_history",
    "help_messages",
    "support_chat",
    "chat_help",
    "help_data",
    "help_store"
  ];

  OLD_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (!val) return;

    try {
      // Try to parse JSON. If it fails, wrap as plain text.
      migrated[key] = JSON.parse(val);
    } catch (e) {
      migrated[key] = val;
    }

    // Remove the old key so storage is clean
    localStorage.removeItem(key);
  });

  // 2. Save into the new standard format
  localStorage.setItem(NEW_KEY, JSON.stringify(migrated));

  console.log("✅ Help storage migrated → seha_help_map", migrated);
})();
