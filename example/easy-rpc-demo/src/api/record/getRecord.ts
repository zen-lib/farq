export type GetRecordRequest = {
	id: string;
};

export type GetRecordResponse = {
	id: string;
	title: string;
	description: string;
};

export default async function getRecord(body: GetRecordRequest): Promise<GetRecordResponse> {
	return {
		id: body.id,
		title: 'Record 1',
		description: 'Description 1',
	};
}
