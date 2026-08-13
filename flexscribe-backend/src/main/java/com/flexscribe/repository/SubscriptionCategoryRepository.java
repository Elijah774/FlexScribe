package com.flexscribe.repository;

import com.flexscribe.model.SubscriptionCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SubscriptionCategoryRepository extends JpaRepository<SubscriptionCategory, Integer> {

    Optional<SubscriptionCategory> findByCategoryName(String categoryName);
}
