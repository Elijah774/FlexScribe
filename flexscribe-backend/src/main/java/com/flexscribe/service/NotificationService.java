package com.flexscribe.service;

import com.flexscribe.model.Notification;
import com.flexscribe.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NotificationService {

    @Autowired private NotificationRepository notifRepo;

    public List<Notification> getAllByUser(Integer subscriberID) {
        return notifRepo.findBySubscriberIDOrderByCreatedAtDesc(subscriberID);
    }

    public List<Notification> getUnread(Integer subscriberID) {
        return notifRepo.findBySubscriberIDAndIsReadFalseOrderByCreatedAtDesc(subscriberID);
    }

    public long getUnreadCount(Integer subscriberID) {
        return notifRepo.countBySubscriberIDAndIsReadFalse(subscriberID);
    }

    @Transactional
    public void markAsRead(Integer notificationID, Integer subscriberID) {
        Notification notif = notifRepo.findById(notificationID)
                .orElseThrow(() -> new RuntimeException("Notification not found"));
        if (!notif.getSubscriberID().equals(subscriberID)) throw new RuntimeException("Access denied");
        notif.setIsRead(true);
        notifRepo.save(notif);
    }

    @Transactional
    public void markAllAsRead(Integer subscriberID) {
        notifRepo.markAllAsRead(subscriberID);
    }

    @Transactional
    public Notification create(Integer subscriberID, String type, String title, String body, String priority) {
        Notification notif = Notification.builder()
                .subscriberID(subscriberID)
                .notificationType(type != null ? type : "system")
                .title(title)
                .body(body)
                .priority(priority != null ? priority : "medium")
                .build();
        return notifRepo.save(notif);
    }
}
