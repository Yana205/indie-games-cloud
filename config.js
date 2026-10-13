// Site configuration.
// Leave supabaseUrl / supabaseAnonKey empty to run in demo mode
// (projects are saved in the visitor's browser only).
// Fill them in (see README) to make the cloud shared and live for everyone.
window.APP_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Credit shown on the page.
  credit: {
    name: "Yana Ifraimov",
    linkedin: "", // e.g. "https://www.linkedin.com/in/your-handle"
    event: "Claude Code Community Meetup · Indie Game Developers",
  },

  // How often (seconds) to check for projects other people dropped.
  pollSeconds: 20,

  // Genres offered in the form. People can also add their own.
  genres: [
    "Action",
    "Adventure",
    "Platformer",
    "Puzzle",
    "RPG",
    "Roguelike",
    "Strategy",
    "Simulation",
    "Shooter",
    "Horror",
    "Narrative",
    "Casual",
    "Arcade",
    "Racing",
    "Sports",
  ],

  // Where the game runs. People can pick more than one.
  platforms: ["Mobile", "PC", "Mac", "Web", "Console", "VR"],

  // Release status, like on itch.io.
  statuses: ["Released", "In development", "Prototype"],
};
