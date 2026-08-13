package com.flexscribe.repository;

import com.flexscribe.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Integer> {

    List<Notification> findBySubscriberIDOrderByCreatedAtDesc(Integer subscriberID);

    List<Notification> findBySubscriberIDAndIsReadFalseOrderByCreatedAtDesc(Integer subscriberID);

    long countBySubscriberIDAndIsReadFalse(Integer subscriberID);

    @Modifying
    @Transactional
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.subscriberID = :subscriberID AND n.isRead = false")
    void markAllAsRead(Integer subscriberID);
}
