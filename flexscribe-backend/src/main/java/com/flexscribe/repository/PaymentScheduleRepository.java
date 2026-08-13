package com.flexscribe.repository;

import com.flexscribe.model.PaymentSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface PaymentScheduleRepository extends JpaRepository<PaymentSchedule, Integer> {

    @Query("SELECT ps FROM PaymentSchedule ps WHERE ps.subscriptionID IN " +
           "(SELECT s.subscriptionID FROM Subscription s WHERE s.subscriberID = :subscriberID AND s.subStatus = 'active') " +
           "AND ps.nextPaymentDate BETWEEN :fromDate AND :toDate " +
           "ORDER BY ps.nextPaymentDate ASC")
    List<PaymentSchedule> findUpcomingBySubscriber(Integer subscriberID, LocalDate fromDate, LocalDate toDate);
}
