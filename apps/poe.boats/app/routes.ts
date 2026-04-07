import { index, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("account", "routes/account.tsx"),
  ...prefix("api", [route("auth/*", "routes/api.auth.$.ts")]),
  route("*", "routes/404.tsx"),
] satisfies RouteConfig;
