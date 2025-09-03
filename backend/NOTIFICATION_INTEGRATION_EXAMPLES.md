# Notification System Integration Examples

This document shows how to integrate the notification system with existing APIs in the CO_LAB CRM backend.

## Quick Start

Import the notification utilities in your route files:

```javascript
const { 
  createNotification, 
  notifyManagers, 
  sendUrgentAlert, 
  createReminder 
} = require('../utils/notifications');
```

## Integration Examples

### 1. Order Status Changes

In `routes/orders.js`, notify managers when order status changes:

```javascript
// In order update endpoint
router.put('/:id', validate(orderUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, ...updateData } = req.body;
    
    // Update order
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
      include: { client: true }
    });

    // If status changed, notify managers
    if (status && status \!== updatedOrder.status) {
      await prisma.order.update({
        where: { id },
        data: { status }
      });

      // Notify managers of status change
      const notificationTitle = 'Order ' + updatedOrder.number + ' Status Changed';
      const notificationContent = 'Order for ' + updatedOrder.client.name + ' changed from ' + updatedOrder.status + ' to ' + status;
      
      await notifyManagers(
        updatedOrder.clientId, 
        'ALERT', 
        notificationTitle, 
        notificationContent,
        {
          relatedId: id,
          relatedType: 'ORDER',
          isUrgent: status === 'URGENT' || status === 'SHIPPED'
        }
      );
    }

    res.json(updatedOrder);
  } catch (error) {
    next(error);
  }
});
```

### 2. Client Communication in Dialogues

In `routes/dialogues.js`, create notifications for new messages:

```javascript
// In message creation endpoint
router.post('/:dialogueId/messages', validate(messageCreateSchema), async (req, res, next) => {
  try {
    const { dialogueId } = req.params;
    const { content, type, isImportant } = req.body;
    const authorId = req.user.id;

    // Create message
    const message = await prisma.message.create({
      data: {
        dialogueId,
        authorId,
        content,
        type,
        isImportant
      },
      include: {
        dialogue: {
          include: {
            client: true,
            manager: {
              include: { user: true }
            }
          }
        }
      }
    });

    // Create notification for the other party
    const dialogue = message.dialogue;
    const isManagerAuthor = authorId === dialogue.manager.userId;
    const recipientId = isManagerAuthor ? dialogue.clientId : dialogue.manager.userId;

    if (recipientId) {
      const notificationTitle = 'New message in dialogue: ' + dialogue.subject;
      const notificationContent = isImportant 
        ? 'IMPORTANT: ' + content.substring(0, 100) + '...'
        : content.substring(0, 100) + '...';

      await createNotification(
        recipientId,
        'MESSAGE',
        notificationTitle,
        notificationContent,
        {
          relatedId: dialogueId,
          relatedType: 'DIALOGUE',
          isUrgent: isImportant
        }
      );
    }

    res.json(message);
  } catch (error) {
    next(error);
  }
});
```

### 3. Inventory Alerts in Warehouse

In `routes/warehouse.js`, send alerts for low stock:

```javascript
// In inventory update endpoint
router.put('/items/:productId', validate(warehouseUpdateSchema), async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    // Update inventory
    const item = await prisma.warehouseItem.update({
      where: { productId },
      data: { quantity },
      include: { product: true }
    });

    // Check if quantity is below minimum stock
    if (quantity <= item.product.minStock && item.product.minStock > 0) {
      // Find all managers to notify about low stock
      const managers = await prisma.manager.findMany({
        where: { isActive: true },
        include: { user: true }
      });

      for (const manager of managers) {
        await sendUrgentAlert(
          manager.userId,
          'Low Stock Alert: ' + item.product.name,
          'Product "' + item.product.name + '" is running low. Current stock: ' + quantity + ', Minimum: ' + item.product.minStock,
          productId,
          'PRODUCT'
        );
      }
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});
```

## Available Utility Functions

### createNotification(userId, type, title, content, options)
Creates a notification for a specific user.

### notifyManagers(clientId, type, title, content, options)
Notifies all managers assigned to a specific client.

### sendUrgentAlert(userId, title, content, relatedId, relatedType)
Sends an urgent notification to a user.

### createReminder(userId, title, content, reminderDate, options)
Creates a reminder notification with expiration.

## Notification Types

- **MESSAGE**: Communication between users
- **REMINDER**: Time-based reminders  
- **ALERT**: Important system alerts
- **SYSTEM**: System-generated notifications

## Best Practices

1. Always include relatedId and relatedType for better traceability
2. Use isUrgent: true sparingly for critical notifications
3. Keep notification content concise but informative
4. Set appropriate expiration dates for time-sensitive notifications
5. Include relevant metadata for context
DOCEND < /dev/null