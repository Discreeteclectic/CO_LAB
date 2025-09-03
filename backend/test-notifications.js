/**
 * Simple test script to verify the notification system
 * Run with: node test-notifications.js
 */

const { PrismaClient } = require('@prisma/client');
const { 
  createNotification, 
  notifyManagers, 
  sendUrgentAlert, 
  getNotificationCounts,
  cleanupExpiredNotifications 
} = require('./src/utils/notifications');

const prisma = new PrismaClient();

async function testNotificationSystem() {
  try {
    console.log('🧪 Testing Notification System...\n');

    // Test 1: Create a simple notification
    console.log('1️⃣ Creating a test notification...');
    
    // First, get a user from the database
    const testUser = await prisma.user.findFirst();
    if (\!testUser) {
      console.error('❌ No users found in database. Please create a user first.');
      return;
    }

    const notification = await createNotification(
      testUser.id,
      'SYSTEM',
      'Test Notification',
      'This is a test notification to verify the system works.',
      {
        metadata: { test: true, timestamp: new Date().toISOString() }
      }
    );
    
    console.log('✅ Notification created:', notification.id);

    // Test 2: Get notification counts
    console.log('\n2️⃣ Getting notification counts...');
    const counts = await getNotificationCounts(testUser.id);
    console.log('✅ Notification counts:', counts);

    // Test 3: Create urgent alert
    console.log('\n3️⃣ Creating urgent alert...');
    const urgentAlert = await sendUrgentAlert(
      testUser.id,
      'System Test Alert',
      'This is a test urgent alert to verify the alert system.',
      null,
      'SYSTEM'
    );
    console.log('✅ Urgent alert created:', urgentAlert.id);

    // Test 4: Test manager notifications (if managers exist)
    const clients = await prisma.client.findFirst();
    if (clients) {
      console.log('\n4️⃣ Testing manager notifications...');
      const managerNotifications = await notifyManagers(
        clients.id,
        'ALERT',
        'Test Manager Notification',
        'Testing the manager notification system.'
      );
      console.log('✅ Manager notifications created:', managerNotifications.length);
    } else {
      console.log('\n4️⃣ ⚠️  No clients found, skipping manager notification test');
    }

    // Test 5: Get updated counts
    console.log('\n5️⃣ Getting updated notification counts...');
    const updatedCounts = await getNotificationCounts(testUser.id);
    console.log('✅ Updated notification counts:', updatedCounts);

    // Test 6: Cleanup test (create an expired notification first)
    console.log('\n6️⃣ Testing cleanup of expired notifications...');
    const expiredNotification = await createNotification(
      testUser.id,
      'SYSTEM',
      'Expired Test Notification',
      'This notification should be cleaned up.',
      {
        expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
      }
    );
    console.log('✅ Expired notification created:', expiredNotification.id);
    
    const cleanedCount = await cleanupExpiredNotifications();
    console.log('✅ Cleaned up notifications:', cleanedCount);

    console.log('\n🎉 All tests completed successfully\!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testNotificationSystem();
}

module.exports = { testNotificationSystem };
TESTEND < /dev/null