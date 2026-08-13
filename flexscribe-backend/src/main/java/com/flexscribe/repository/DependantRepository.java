package com.flexscribe.repository;

import com.flexscribe.model.Dependant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DependantRepository extends JpaRepository<Dependant, Integer> {

    List<Dependant> findByMainMemberID(Integer mainMemberID);

    Optional<Dependant> findByDependantIDAndMainMemberID(Integer dependantID, Integer mainMemberID);
}
