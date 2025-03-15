export type Record = {
	id: string;
	title: string;
	description: string;
};

export type GetAllRecordsResponse = {
	records: Record[];
};

export default async function getAllRecords(): Promise<GetAllRecordsResponse> {
	return {
		records: [
			{
				id: '123',
				title: 'Record 1',
				description: 'Description 1',
			},
			{
				id: '456',
				title: 'Record 2',
				description: 'Description 2',
			},
			{
				id: '789',
				title: 'Record 3',
				description: 'Description 3',
			},
		],
	};
}
