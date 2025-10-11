import Image from "next/image";
import {RegisterLink, LoginLink} from "@kinde-oss/kinde-auth-nextjs/components";


export default function Home() {
  return (
    <main>
      <h1>Welcome to Query Now</h1>
      <p>Your one-stop solution for all your querying needs.</p>
      <LoginLink>Sign in</LoginLink>

<RegisterLink>Sign up</RegisterLink>
    </main>
  );
}
