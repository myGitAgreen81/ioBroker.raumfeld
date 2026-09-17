// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			/** Adresse des Raumfeld-Hosts; leer bedeutet automatische Suche. */
			hostAddress: string;
			/** Quelladresse fuer die SSDP-Suche bei mehreren Netzkarten. */
			bindAddress: string;
			/** Fester Port fuer den Ereignis-Rueckkanal; 0 waehlt das System. */
			eventPort: number;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
