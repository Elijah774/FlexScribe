package com.flexscribe.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "SubscriptionCategory")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SubscriptionCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "categoryID")
    private Integer categoryID;

    @Column(name = "categoryName", nullable = false, unique = true, length = 100)
    private String categoryName;
}
