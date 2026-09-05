import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env before seeding the admin user."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: "Brian" },
  });

  console.log(`Seeded admin user: ${user.email}`);

  const foundingPrice = await prisma.setting.upsert({
    where: { key: "founding_price_cents" },
    update: {},
    create: { key: "founding_price_cents", value: "24900" },
  });
  console.log(`Founding price setting: $${Number(foundingPrice.value) / 100}/mo`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
