import { withAuth } from "@kinde-oss/kinde-auth-nextjs/middleware";

export default withAuth({
  isReturnToCurrentPage: true,
});

export const config = {
  matcher: [
    "/chat/:path*",
    "/api/documents/:path*",
    "/api/chat/:path*",
    "/api/graph/:path*",
    "/api/user/:path*",
  ],
};
