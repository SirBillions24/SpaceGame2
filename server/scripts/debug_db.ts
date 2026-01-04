import prisma from '../src/lib/prisma';

async function checkDb() {
    const users = await prisma.user.findMany();
    console.log(`Users: ${users.length}`);
    users.forEach(u => console.log(`- ${u.username} (${u.id})`));

    const planets = await prisma.planet.findMany();
    console.log(`Planets: ${planets.length}`);
    planets.forEach(p => console.log(`- [${p.isNpc ? 'NPC' : 'USER'}] ${p.name} @ ${p.x},${p.y} (Owner: ${p.ownerId})`));
}

checkDb()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
