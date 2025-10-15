import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";

export async function getAuthenticatedUser(throwOnUnauth: boolean = false) {
  try {
    const { getUser, isAuthenticated } = getKindeServerSession();
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      throw new Error('Unauthorized');
    }
    const user = await getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }
    return user;
  } catch (error: any) {
    if (error?.digest?.includes('NEXT_REDIRECT')) {
      if (throwOnUnauth) {
        throw new Error('Unauthorized');
      }
      throw error;
    }
    if (throwOnUnauth) {
      throw new Error('Unauthorized');
    }
    redirect("/api/auth/login");
  }
}

export async function getUserId() {
  const user = await getAuthenticatedUser();
  return user.id;
}

export async function getUserDetails(throwOnUnauth: boolean = false) {
  try {
    const { getUser, isAuthenticated, getPermissions, getOrganization } = getKindeServerSession();
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      throw new Error('Unauthorized');
    }
    const user = await getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }
    const permissions = await getPermissions();
    const organization = await getOrganization();
    return {
      id: user.id!,
      email: user.email!,
      firstName: user.given_name,
      lastName: user.family_name,
      fullName: `${user.given_name || ''} ${user.family_name || ''}`.trim(),
      picture: user.picture,
      permissions,
      organization,
      isVerified: (user as any).email_verified,
      createdAt: (user as any).created_at,
      updatedAt: (user as any).updated_at
    };
  } catch (error: any) {
    if (error?.digest?.includes('NEXT_REDIRECT')) {
      if (throwOnUnauth) {
        throw new Error('Unauthorized');
      }
      throw error;
    }
    if (throwOnUnauth) {
      throw new Error('Unauthorized');
    }
    redirect("/api/auth/login");
  }
}

export async function checkAuthentication() {
  const { isAuthenticated } = getKindeServerSession();
  return await isAuthenticated();
}
