// Site configuration.
// Leave supabaseUrl / supabaseAnonKey empty to run in demo mode
// (projects are saved in the visitor's browser only).
// Fill them in (see README) to make the cloud shared and live for everyone.
window.APP_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",

  // How often (seconds) to check for projects other people dropped.
  pollSeconds: 20,

  // Categories offered in the form. People can also create new ones.
  defaultCategories: [
    "Agent",
    "Tool",
    "Web app",
    "Game",
    "Skill / Plugin",
    "MCP server",
    "Education",
    "Art & Design",
    "Productivity",
    "Data",
  ],
};
