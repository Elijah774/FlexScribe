package com.flexscribe.controller;

import com.flexscribe.dto.ApiResponse;
import com.flexscribe.model.Notification;
import com.flexscribe.security.CurrentUser;
import com.flexscribe.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    @Autowired private NotificationService notificationService;

    @GetMapping
    public ResponseEntity<List<Notification>> getAll() {
        return ResponseEntity.ok(notificationService.getAllByUser(CurrentUser.getId()));
    }

    @GetMapping("/unread")
    public ResponseEntity<List<Notification>> getUnread() {
        return ResponseEntity.ok(notificationService.getUnread(CurrentUser.getId()));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> getUnreadCount() {
        long count = notificationService.getUnreadCount(CurrentUser.getId());
        return ResponseEntity.ok(Map.of("count", count));
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<?> markAsRead(@PathVariable Integer id) {
        try {
            notificationService.markAsRead(id, CurrentUser.getId());
            return ResponseEntity.ok(ApiResponse.ok("Marked as read"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PatchMapping("/mark-all-read")
    public ResponseEntity<?> markAllAsRead() {
        notificationService.markAllAsRead(CurrentUser.getId());
        return ResponseEntity.ok(ApiResponse.ok("All notifications marked as read"));
    }
}
