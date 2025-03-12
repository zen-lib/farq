export type GetUserRequest = {
	id: string;
};

export type GetUserResponse = {
	id: string;
	name: string;
	email: string;
};

export default async function getUser(req: GetUserRequest): Promise<GetUserResponse> {
	// This would typically fetch from a database
	return {
		id: req.id,
		name: 'John Doe',
		email: 'john.doe@example.com',
	};
}
