package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "Notification")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "notificationID")
    private Integer notificationID;

    @Column(name = "subscriberID", nullable = false)
    private Integer subscriberID;

    @Column(name = "subscriptionID")
    private Integer subscriptionID;

    @Column(name = "transactionID")
    private Integer transactionID;

    @Column(name = "notificationType", nullable = false, length = 50)
    @Builder.Default
    private String notificationType = "payment";

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "body", columnDefinition = "VARCHAR(MAX)")
    private String body;

    @Column(name = "isRead", nullable = false)
    @Builder.Default
    private Boolean isRead = false;

    @Column(name = "priority", nullable = false, length = 20)
    @Builder.Default
    private String priority = "medium";

    @Column(name = "linkTo", length = 100)
    private String linkTo;

    @Column(name = "createdAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
