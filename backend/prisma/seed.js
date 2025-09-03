const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@colab-crm.com' },
    update: {},
    create: {
      email: 'admin@colab-crm.com',
      name: 'Администратор',
      password: hashedPassword,
      role: 'ADMIN'
    }
  });

  console.log('✅ Admin user created:', adminUser.email);

  // Create demo user
  const demoHashedPassword = await bcrypt.hash('demo123', 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@colab-crm.com' },
    update: {},
    create: {
      email: 'demo@colab-crm.com',
      name: 'Демо пользователь',
      password: demoHashedPassword,
      role: 'USER'
    }
  });

  console.log('✅ Demo user created:', demoUser.email);

  // Create sample clients
  const clients = await Promise.all([
    prisma.client.upsert({
      where: { name: 'ООО "Техносвет"' },
      update: {},
      create: {
        name: 'ООО "Техносвет"',
        code: 'TEC001',
        contactPerson: 'Иванов Иван Иванович',
        position: 'Директор',
        phone: '+998901234567',
        email: 'info@tehnosvet.uz',
        address: 'г. Ташкент, ул. Амира Темура, 123',
        notes: 'Постоянный клиент, работаем с 2020 года'
      }
    }),
    prisma.client.upsert({
      where: { name: 'ИП "Строймастер"' },
      update: {},
      create: {
        name: 'ИП "Строймастер"',
        code: 'STR002',
        contactPerson: 'Петров Петр Петрович',
        position: 'ИП',
        phone: '+998907654321',
        email: 'stroymaster@example.uz',
        address: 'г. Самарканд, ул. Регистан, 45',
        notes: 'Специализируется на строительных материалах'
      }
    })
  ]);

  console.log('✅ Sample clients created:', clients.length);

  // Create sample products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Светодиодная лампа 12W',
        code: 'LED12W001',
        supplier: 'Philips',
        unit: 'шт',
        purchasePrice: 25000,
        minStock: 50,
        location: 'Стеллаж А1',
        description: 'Энергосберегающая светодиодная лампа мощностью 12W'
      }
    }),
    prisma.product.create({
      data: {
        name: 'Кабель силовой ВВГ 3x2.5',
        code: 'VVG325001',
        supplier: 'Узкабель',
        unit: 'м',
        purchasePrice: 8500,
        minStock: 100,
        location: 'Склад Б2',
        description: 'Силовой медный кабель ВВГ сечением 3x2.5 мм²'
      }
    }),
    prisma.product.create({
      data: {
        name: 'Автоматический выключатель 16A',
        code: 'MCB16A001',
        supplier: 'ABB',
        unit: 'шт',
        purchasePrice: 45000,
        minStock: 20,
        location: 'Стеллаж В3',
        description: 'Модульный автоматический выключатель 1P 16A характеристика C'
      }
    })
  ]);

  console.log('✅ Sample products created:', products.length);

  // Create warehouse items for products
  await Promise.all(
    products.map(product =>
      prisma.warehouseItem.create({
        data: {
          productId: product.id,
          quantity: Math.floor(Math.random() * 200) + 50 // Random quantity between 50-250
        }
      })
    )
  );

  console.log('✅ Warehouse items created');

  // Create sample calculation
  const calculation = await prisma.calculation.create({
    data: {
      userId: demoUser.id,
      clientId: clients[0].id,
      name: 'Поставка электротоваров',
      brokerPercent: 5,
      transportCost: 2000000,
      certificationCost: 500000,
      customsCost: 4000000,
      vatPercent: 12,
      quattroMargin: 30,
      totalCost: 0 // Will be calculated
    }
  });

  // Add calculation items
  const calculationItems = await Promise.all([
    prisma.calculationItem.create({
      data: {
        calculationId: calculation.id,
        productId: products[0].id,
        name: products[0].name,
        cost: products[0].purchasePrice,
        duty: 10,
        quantity: 100,
        finalPrice: 0 // Will be calculated
      }
    }),
    prisma.calculationItem.create({
      data: {
        calculationId: calculation.id,
        productId: products[2].id,
        name: products[2].name,
        cost: products[2].purchasePrice,
        duty: 15,
        quantity: 50,
        finalPrice: 0 // Will be calculated
      }
    })
  ]);

  // Calculate and update totals (simplified calculation)
  const totalBaseCost = calculationItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
  const estimatedTotalCost = totalBaseCost * 1.8; // Rough estimate

  await prisma.calculation.update({
    where: { id: calculation.id },
    data: { totalCost: estimatedTotalCost }
  });

  console.log('✅ Sample calculation created');

  // Create some sample transactions
  await Promise.all([
    prisma.transaction.create({
      data: {
        productId: products[0].id,
        userId: demoUser.id,
        clientId: clients[0].id,
        type: 'OUTGOING',
        quantity: 10,
        reason: 'Отгрузка по договору №123'
      }
    }),
    prisma.transaction.create({
      data: {
        productId: products[1].id,
        userId: demoUser.id,
        type: 'INCOMING',
        quantity: 50,
        reason: 'Поступление товара от поставщика'
      }
    })
  ]);

  console.log('✅ Sample transactions created');

  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('📋 Demo credentials:');
  console.log('Admin: admin@colab-crm.com / admin123');
  console.log('Demo User: demo@colab-crm.com / demo123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });