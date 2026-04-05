package storage

import (
	"fmt"
	"strings"

	"b8n6mail/models"
)

const domainsFile = "domains.json"

// ReadDomains returns all configured domains.
func ReadDomains() ([]models.Domain, error) {
	var domains []models.Domain
	if err := ReadJSON(FilePath(domainsFile), &domains); err != nil {
		return nil, err
	}
	if domains == nil {
		domains = []models.Domain{}
	}
	return domains, nil
}

// WriteDomains persists the domains list.
func WriteDomains(domains []models.Domain) error {
	return WriteJSON(FilePath(domainsFile), domains)
}

// FindDomain locates a domain config matching the email's domain part.
func FindDomain(emailOrDomain string) (*models.Domain, error) {
	part := emailOrDomain
	if idx := strings.LastIndex(emailOrDomain, "@"); idx >= 0 {
		part = emailOrDomain[idx+1:]
	}
	domains, err := ReadDomains()
	if err != nil {
		return nil, err
	}
	for i := range domains {
		if strings.EqualFold(domains[i].Domain, part) && domains[i].Active {
			return &domains[i], nil
		}
	}
	return nil, fmt.Errorf("domain not configured: %s", part)
}
