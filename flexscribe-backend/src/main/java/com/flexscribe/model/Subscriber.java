package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "Subscriber")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Subscriber {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "subscriberID")
    private Integer subscriberID;

    @Column(name = "firstName", nullable = false, length = 100)
    private String firstName;

    @Column(name = "lastName", nullable = false, length = 100)
    private String lastName;

    @Column(name = "preferredName", length = 100)
    private String preferredName;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "passwordHash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "phone", length = 50)
    private String phone;

    @Column(name = "userType", nullable = false, length = 50)
    @Builder.Default
    private String userType = "MainMember";

    @Column(name = "scribeScore", nullable = false)
    @Builder.Default
    private Integer scribeScore = 0;

    @Column(name = "avatarUrl", length = 500)
    private String avatarUrl;

    @Column(name = "marketingOptIn", nullable = false)
    @Builder.Default
    private Boolean marketingOptIn = false;

    @Column(name = "createdAt", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updatedAt", nullable = false)
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
